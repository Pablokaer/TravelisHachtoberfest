import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';

import { FakeMailer } from '../_shared/fake-mailer.ts';
import { createWelcomeHandler, type WelcomeClaim, type WelcomeStore } from './handler.ts';

/** In-memory profiles: one claim per user until released, like claim_welcome_email. */
class FakeWelcomeStore implements WelcomeStore {
  readonly sentAt = new Map<string, boolean>();
  readonly released: string[] = [];
  constructor(
    private readonly profiles: Record<string, WelcomeClaim>,
    private readonly broken = false,
  ) {}

  claim(userId: string): Promise<WelcomeClaim | null> {
    if (this.broken) return Promise.reject(new Error('db down'));
    const profile = this.profiles[userId];
    if (!profile || this.sentAt.get(userId)) return Promise.resolve(null);
    this.sentAt.set(userId, true);
    return Promise.resolve(profile);
  }

  release(userId: string): Promise<void> {
    this.sentAt.delete(userId);
    this.released.push(userId);
    return Promise.resolve();
  }
}

/** Swallows structured log lines, keeping them for assertions. */
class FakeLogSink {
  readonly lines: string[] = [];
  write = (_level: string, text: string): void => void this.lines.push(text);
}

const ANA: WelcomeClaim = { email: 'ana@example.com', language: 'pt', displayName: 'Ana' };
const USER = { id: 'u1' };
const post = () => new Request('http://localhost/welcome-email', { method: 'POST' });

function setup(opts: { store?: FakeWelcomeStore; mailer?: FakeMailer } = {}) {
  const store = opts.store ?? new FakeWelcomeStore({ u1: ANA });
  const mailer = opts.mailer ?? new FakeMailer();
  const logs = new FakeLogSink();
  const handler = createWelcomeHandler({
    store,
    mailer,
    appUrl: 'https://travelist.app',
    log: logs.write,
  });
  return { handler, store, mailer, logs };
}

Deno.test('sends the welcome email in the profile language and answers "sent"', async () => {
  const { handler, mailer } = setup();
  const res = await handler(post(), USER);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { status: 'sent' });
  assertEquals(mailer.sent.length, 1);
  assertEquals(mailer.sent[0]!.to, 'ana@example.com');
  assertEquals(mailer.sent[0]!.subject, 'Bem-vindo ao Travelist');
  assertStringIncludes(mailer.sent[0]!.html, 'Ana');
  assertStringIncludes(mailer.sent[0]!.html, 'https://travelist.app');
});

Deno.test('a second call sends nothing and answers "not_needed"', async () => {
  const { handler, mailer } = setup();
  await handler(post(), USER);
  const res = await handler(post(), USER);
  assertEquals(await res.json(), { status: 'not_needed' });
  assertEquals(mailer.sent.length, 1);
});

Deno.test('two concurrent calls send exactly one email', async () => {
  const { handler, mailer } = setup();
  await Promise.all([handler(post(), USER), handler(post(), USER)]);
  assertEquals(mailer.sent.length, 1);
});

Deno.test('a provider failure releases the claim and answers 502 so the app retries', async () => {
  const store = new FakeWelcomeStore({ u1: ANA });
  const { handler, logs } = setup({ store, mailer: new FakeMailer(new Error('timeout')) });
  const res = await handler(post(), USER);
  assertEquals(res.status, 502);
  assertEquals((await res.json()).error, 'email_failed');
  assertEquals(store.released, ['u1']);
  assertStringIncludes(logs.lines.join('\n'), 'welcome_email_failed');
});

Deno.test('a database failure answers 500 without sending', async () => {
  const { handler, mailer } = setup({ store: new FakeWelcomeStore({}, true) });
  const res = await handler(post(), USER);
  assertEquals(res.status, 500);
  assertEquals(mailer.sent.length, 0);
});

Deno.test('an unknown profile language is written in English', async () => {
  const store = new FakeWelcomeStore({ u1: { ...ANA, language: 'xx', displayName: null } });
  const { handler, mailer } = setup({ store });
  await handler(post(), USER);
  assertEquals(mailer.sent[0]!.subject, 'Welcome to Travelist');
});

Deno.test('only POST is accepted', async () => {
  const { handler } = setup();
  const res = await handler(new Request('http://localhost/welcome-email'), USER);
  assertEquals(res.status, 405);
});
