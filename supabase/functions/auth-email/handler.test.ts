import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';

import { FakeMailer } from '../_shared/fake-mailer.ts';
import { HttpError } from '../_shared/http.ts';
import { createAuthEmailHandler, type ProfileLanguageReader } from './handler.ts';
import { HookSignatureError, type HookVerifier } from './signature.ts';

/** Accepts bodies whose `webhook-signature` header is "valid", like a correct HMAC would. */
class FakeHookVerifier {
  verify: HookVerifier = (body, headers) => {
    if (headers['webhook-signature'] !== 'valid') throw new HookSignatureError('bad signature');
    return JSON.parse(body);
  };
}

/** profiles.language by user id; throws for ids listed as broken. */
class FakeProfileLanguages {
  constructor(private readonly rows: Record<string, string>, private readonly broken = '') {}
  read: ProfileLanguageReader = (userId) => {
    if (userId === this.broken) return Promise.reject(new Error('db down'));
    return Promise.resolve(this.rows[userId] ?? null);
  };
}

/** Swallows log lines so test output stays clean, and keeps them for assertions. */
class FakeLogSink {
  readonly lines: string[] = [];
  write = (_level: string, text: string): void => void this.lines.push(text);
}

const AUTH_URL = 'http://127.0.0.1:54321';

function hookBody(type: string, metadataLanguage?: string) {
  return JSON.stringify({
    user: {
      id: 'u1',
      email: 'nina@example.com',
      user_metadata: metadataLanguage ? { language: metadataLanguage } : {},
    },
    email_data: {
      token: '123456',
      token_hash: 'pkce_abc',
      redirect_to: 'http://localhost:8081/auth/reset-password',
      email_action_type: type,
      site_url: 'http://localhost:8081',
      token_new: '',
      token_hash_new: '',
    },
  });
}

function hookRequest(body: string, signature = 'valid'): Request {
  return new Request('http://localhost/auth-email', {
    method: 'POST',
    headers: { 'webhook-signature': signature, 'content-type': 'application/json' },
    body,
  });
}

function setup(opts: { mailer?: FakeMailer; languages?: FakeProfileLanguages } = {}) {
  const mailer = opts.mailer ?? new FakeMailer();
  const logs = new FakeLogSink();
  const handler = createAuthEmailHandler({
    verify: new FakeHookVerifier().verify,
    mailer,
    profileLanguage: (opts.languages ?? new FakeProfileLanguages({})).read,
    authUrl: AUTH_URL,
    log: logs.write,
  });
  return { handler, mailer, logs };
}

Deno.test('sends the recovery email with a link to the reset page, answering 200 {}', async () => {
  const { handler, mailer } = setup();
  const res = await handler(hookRequest(hookBody('recovery', 'en')));
  assertEquals(res.status, 200);
  assertEquals(await res.json(), {});
  assertEquals(mailer.sent.length, 1);
  assertEquals(mailer.sent[0]!.to, 'nina@example.com');
  assertStringIncludes(
    mailer.sent[0]!.text,
    'http://localhost:8081/auth/reset-password?token_hash=pkce_abc&type=recovery',
  );
});

Deno.test("writes in the profile's language, which wins over sign-up metadata", async () => {
  const { handler, mailer } = setup({ languages: new FakeProfileLanguages({ u1: 'pt' }) });
  await handler(hookRequest(hookBody('recovery', 'en')));
  assertStringIncludes(mailer.sent[0]!.subject, 'palavra-passe');
});

Deno.test('falls back to the sign-up metadata language when there is no profile yet', async () => {
  const { handler, mailer } = setup();
  await handler(hookRequest(hookBody('signup', 'pt')));
  assertEquals(mailer.sent[0]!.subject, 'Confirme a sua conta Travelist');
});

Deno.test('a failing profile lookup still sends, in the metadata language', async () => {
  const { handler, mailer } = setup({ languages: new FakeProfileLanguages({}, 'u1') });
  const res = await handler(hookRequest(hookBody('magiclink', 'pt')));
  assertEquals(res.status, 200);
  assertEquals(mailer.sent[0]!.subject, 'O seu link de acesso ao Travelist');
});

Deno.test('unknown or missing languages get English', async () => {
  const { handler, mailer } = setup();
  await handler(hookRequest(hookBody('magiclink', 'fr')));
  assertEquals(mailer.sent[0]!.subject, 'Your Travelist sign-in link');
});

Deno.test('a bad signature is refused with 401 in the hook error shape, sending nothing', async () => {
  const { handler, mailer } = setup();
  const res = await handler(hookRequest(hookBody('recovery'), 'forged'));
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error.http_code, 401);
  assertEquals(mailer.sent.length, 0);
});

Deno.test('a provider failure answers 500 so Auth reports the email was not sent', async () => {
  const error = new HttpError('https://api.resend.com/emails', 403, 'domain not verified');
  const { handler, logs } = setup({ mailer: new FakeMailer(error) });
  const res = await handler(hookRequest(hookBody('recovery')));
  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.error.http_code, 500);
  assertStringIncludes(logs.lines.join('\n'), '"status":403');
});

Deno.test('an invalid payload is refused with 400', async () => {
  const { handler } = setup();
  const res = await handler(hookRequest(JSON.stringify({ user: {} })));
  assertEquals(res.status, 400);
});

Deno.test('only POST is accepted', async () => {
  const { handler } = setup();
  const res = await handler(new Request('http://localhost/auth-email'));
  assertEquals(res.status, 405);
});
