import { assertEquals, assertThrows } from 'jsr:@std/assert@1';
import { Webhook } from 'standardwebhooks';

import { HookSignatureError, standardWebhookVerifier } from './signature.ts';

const SECRET = 'v1,whsec_' + btoa('a-test-secret-of-32-bytes-length');

function signedHeaders(body: string, secret = SECRET): Record<string, string> {
  const id = 'msg_1';
  const now = new Date();
  const signature = new Webhook(secret.replace('v1,whsec_', '')).sign(id, now, body);
  return {
    'webhook-id': id,
    'webhook-timestamp': String(Math.floor(now.getTime() / 1000)),
    'webhook-signature': signature,
  };
}

Deno.test('a body signed with the hook secret verifies and parses', () => {
  const body = JSON.stringify({ hello: 'world' });
  assertEquals(standardWebhookVerifier(SECRET)(body, signedHeaders(body)), { hello: 'world' });
});

Deno.test('a tampered body is rejected', () => {
  const headers = signedHeaders('{"a":1}');
  assertThrows(() => standardWebhookVerifier(SECRET)('{"a":2}', headers), HookSignatureError);
});

Deno.test('a secret not in the "v1,whsec_<base64>" format fails loudly', () => {
  assertThrows(() => standardWebhookVerifier('plain-secret'), Error, 'v1,whsec_');
});
