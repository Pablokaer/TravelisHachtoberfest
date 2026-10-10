import { assertEquals, assertRejects, assertThrows } from 'jsr:@std/assert@1';

import type { FetchJson, FetchJsonOptions } from './http.ts';
import { HttpError } from './http.ts';
import {
  type EmailMessage,
  MailerConfigError,
  mailerFromConfig,
  mailFailureFields,
  MailpitMailer,
  parseAddress,
  ResendMailer,
} from './mailer.ts';

/** Fake HTTP transport: records every request and answers with a fixed body or error. */
class FakeMailTransport {
  readonly calls: { url: string; options?: FetchJsonOptions }[] = [];
  constructor(private readonly outcome: { body?: unknown; error?: Error } = { body: {} }) {}
  fetchJson: FetchJson = <T>(url: string, options?: FetchJsonOptions) => {
    this.calls.push({ url, options });
    if (this.outcome.error) return Promise.reject(this.outcome.error);
    return Promise.resolve(this.outcome.body as T);
  };
}

const MESSAGE: EmailMessage = {
  to: 'nina@example.com',
  subject: 'Welcome',
  html: '<p>Hi</p>',
  text: 'Hi',
};

Deno.test('ResendMailer posts the message to the Resend API with the key and sender', async () => {
  const transport = new FakeMailTransport({ body: { id: 'abc' } });
  const mailer = new ResendMailer(
    { apiKey: 're_123', from: 'Travelist <hello@travelist.app>' },
    transport.fetchJson,
  );
  await mailer.send(MESSAGE);
  assertEquals(transport.calls.length, 1);
  const call = transport.calls[0]!;
  assertEquals(call.url, 'https://api.resend.com/emails');
  assertEquals(call.options?.method, 'POST');
  assertEquals(call.options?.headers?.Authorization, 'Bearer re_123');
  assertEquals(call.options?.body, {
    from: 'Travelist <hello@travelist.app>',
    to: ['nina@example.com'],
    subject: 'Welcome',
    html: '<p>Hi</p>',
    text: 'Hi',
  });
  assertEquals(typeof call.options?.timeoutMs, 'number');
});

Deno.test('ResendMailer surfaces the provider status in its error', async () => {
  const error = new HttpError('https://api.resend.com/emails', 422, '{"message":"bad from"}');
  const mailer = new ResendMailer(
    { apiKey: 're_123', from: 'x@y.z' },
    new FakeMailTransport({ error }).fetchJson,
  );
  const thrown = await assertRejects(() => mailer.send(MESSAGE));
  assertEquals((thrown as HttpError).status, 422);
});

Deno.test('MailpitMailer posts to the Mailpit send API in its own payload shape', async () => {
  const transport = new FakeMailTransport({ body: { ID: 'm1' } });
  const mailer = new MailpitMailer(
    { url: 'http://inbucket:8025/', from: 'Travelist <hello@travelist.local>' },
    transport.fetchJson,
  );
  await mailer.send(MESSAGE);
  const call = transport.calls[0]!;
  assertEquals(call.url, 'http://inbucket:8025/api/v1/send');
  assertEquals(call.options?.body, {
    From: { Email: 'hello@travelist.local', Name: 'Travelist' },
    To: [{ Email: 'nina@example.com' }],
    Subject: 'Welcome',
    HTML: '<p>Hi</p>',
    Text: 'Hi',
  });
});

Deno.test('mailerFromConfig picks Resend when an API key is set', () => {
  const transport = new FakeMailTransport();
  const mailer = mailerFromConfig(
    { resendApiKey: 're_1', mailpitUrl: 'http://inbucket:8025', from: 'a@b.c' },
    transport.fetchJson,
  );
  assertEquals(mailer instanceof ResendMailer, true);
});

Deno.test('mailerFromConfig falls back to Mailpit for local development', () => {
  const mailer = mailerFromConfig(
    { mailpitUrl: 'http://inbucket:8025', from: 'a@b.c' },
    new FakeMailTransport().fetchJson,
  );
  assertEquals(mailer instanceof MailpitMailer, true);
});

Deno.test('mailerFromConfig fails loudly when no provider is configured', () => {
  const error = assertThrows(
    () => mailerFromConfig({ from: 'a@b.c' }, new FakeMailTransport().fetchJson),
    MailerConfigError,
  );
  assertEquals(error.message.includes('RESEND_API_KEY'), true);
});

Deno.test('mailerFromConfig requires a sender address', () => {
  assertThrows(
    () => mailerFromConfig({ resendApiKey: 're_1' }, new FakeMailTransport().fetchJson),
    MailerConfigError,
    'EMAIL_FROM',
  );
});

Deno.test('parseAddress splits "Name <email>" and accepts a bare address', () => {
  assertEquals(parseAddress('"Travelist" <hi@x.app>'), { Email: 'hi@x.app', Name: 'Travelist' });
  assertEquals(parseAddress('<hi@x.app>'), { Email: 'hi@x.app' });
  assertEquals(parseAddress(' hi@x.app '), { Email: 'hi@x.app' });
});

Deno.test('mailFailureFields reports the provider status and body, or the message', () => {
  const error = new HttpError('https://api.resend.com/emails', 403, 'domain not verified');
  assertEquals(mailFailureFields(error), {
    error: 'HTTP 403 from api.resend.com',
    status: 403,
    body: 'domain not verified',
  });
  assertEquals(mailFailureFields(new Error('timeout')), { error: 'timeout' });
});
