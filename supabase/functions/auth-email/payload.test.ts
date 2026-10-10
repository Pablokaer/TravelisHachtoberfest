import { assertEquals, assertThrows } from 'jsr:@std/assert@1';

import {
  appLink,
  type AuthHookPayload,
  parseHookPayload,
  planAuthEmails,
  verifyLink,
} from './payload.ts';

const AUTH_URL = 'http://127.0.0.1:54321';

function payload(over: {
  type: string;
  user?: Partial<AuthHookPayload['user']>;
  data?: Partial<AuthHookPayload['email_data']>;
}): AuthHookPayload {
  return parseHookPayload({
    user: {
      id: 'u1',
      email: 'nina@example.com',
      user_metadata: { language: 'pt', display_name: 'Nina' },
      ...over.user,
    },
    email_data: {
      token: '123456',
      token_hash: 'pkce_abc',
      redirect_to: 'http://localhost:8081/auth/reset-password',
      email_action_type: over.type,
      site_url: 'http://localhost:8081',
      token_new: '',
      token_hash_new: '',
      ...over.data,
    },
  });
}

Deno.test('verifyLink builds the Auth verify URL with encoded parameters', () => {
  assertEquals(
    verifyLink(AUTH_URL + '/', 'pkce_a b', 'recovery', 'http://x/a?b=1'),
    'http://127.0.0.1:54321/auth/v1/verify?token=pkce_a+b&type=recovery&redirect_to=http%3A%2F%2Fx%2Fa%3Fb%3D1',
  );
});

Deno.test('appLink adds the token hash and type to the app page, keeping its query', () => {
  assertEquals(
    appLink('http://localhost:8081/auth/reset-password?lang=pt', 'pkce_1', 'recovery'),
    'http://localhost:8081/auth/reset-password?lang=pt&token_hash=pkce_1&type=recovery',
  );
  assertEquals(
    appLink('wayfarer://auth/reset-password', 'pkce_1', 'recovery'),
    'wayfarer://auth/reset-password?token_hash=pkce_1&type=recovery',
  );
});

Deno.test('a recovery email links straight to the reset page with the token hash', () => {
  // The page verifies the hash itself (verifyOtp), so the link works on any device or browser,
  // not only where the reset was requested (PKCE codes need that browser's code verifier), and a
  // mail scanner opening the link cannot use up the token.
  const [email] = planAuthEmails(payload({ type: 'recovery' }), AUTH_URL);
  assertEquals(email!.to, 'nina@example.com');
  assertEquals(email!.kind, 'recovery');
  assertEquals(
    email!.vars.actionUrl,
    'http://localhost:8081/auth/reset-password?token_hash=pkce_abc&type=recovery',
  );
  assertEquals(email!.vars.name, 'Nina');
});

Deno.test('a magic link carries both the link and the 6-digit code', () => {
  const [email] = planAuthEmails(payload({ type: 'magiclink' }), AUTH_URL);
  assertEquals(email!.kind, 'magiclink');
  assertEquals(email!.vars.code, '123456');
  assertEquals(email!.vars.actionUrl?.includes('type=magiclink'), true);
});

Deno.test('an OTP "email" action is sent as a magic link', () => {
  const [email] = planAuthEmails(payload({ type: 'email' }), AUTH_URL);
  assertEquals(email!.kind, 'magiclink');
});

Deno.test('an empty redirect falls back to the site URL', () => {
  const [email] = planAuthEmails(payload({ type: 'signup', data: { redirect_to: '' } }), AUTH_URL);
  assertEquals(email!.vars.actionUrl?.endsWith('redirect_to=http%3A%2F%2Flocalhost%3A8081'), true);
});

Deno.test('a secure email change mails both addresses with their own token pair', () => {
  const emails = planAuthEmails(
    payload({
      type: 'email_change',
      user: { new_email: 'nina@new.io' },
      data: {
        token: '111111',
        token_hash_new: 'hash_current',
        token_new: '222222',
        token_hash: 'hash_new',
      },
    }),
    AUTH_URL,
  );
  assertEquals(emails.map((e) => e.to), ['nina@example.com', 'nina@new.io']);
  // Supabase's naming is reversed for backward compatibility: token + token_hash_new go to the
  // current address, token_new + token_hash to the new one (send-email-hook docs).
  assertEquals(emails[0]!.vars.code, '111111');
  assertEquals(emails[0]!.vars.actionUrl?.includes('token=hash_current'), true);
  assertEquals(emails[1]!.vars.code, '222222');
  assertEquals(emails[1]!.vars.actionUrl?.includes('token=hash_new'), true);
  assertEquals(emails[0]!.vars.newEmail, 'nina@new.io');
});

Deno.test('a single email change mails only the new address', () => {
  const emails = planAuthEmails(
    payload({ type: 'email_change', user: { new_email: 'nina@new.io' } }),
    AUTH_URL,
  );
  assertEquals(emails.map((e) => e.to), ['nina@new.io']);
  assertEquals(emails[0]!.vars.actionUrl?.includes('token=pkce_abc'), true);
});

Deno.test('reauthentication sends only the code', () => {
  const [email] = planAuthEmails(payload({ type: 'reauthentication' }), AUTH_URL);
  assertEquals(email!.vars, { code: '123456', name: 'Nina' });
});

Deno.test('notification types this app has not enabled send nothing', () => {
  assertEquals(planAuthEmails(payload({ type: 'password_changed_notification' }), AUTH_URL), []);
});

Deno.test('parseHookPayload rejects a payload without the user email, naming the field', () => {
  assertThrows(
    () => parseHookPayload({ user: { id: 'u1' }, email_data: {} }),
    Error,
    'user.email',
  );
});
