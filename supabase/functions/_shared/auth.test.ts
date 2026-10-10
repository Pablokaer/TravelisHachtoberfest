import { assertEquals } from 'jsr:@std/assert@1';

import { requireUser, supabaseUserVerifier } from './auth.ts';

const handler = requireUser(
  (token) => Promise.resolve(token === 'good' ? { id: 'u1' } : null),
  (_req, user) => Promise.resolve(new Response(user.id)),
);

Deno.test('requireUser: rejects missing and invalid tokens, passes valid users', async () => {
  assertEquals((await handler(new Request('http://x', { method: 'POST' }))).status, 401);
  const bad = new Request('http://x', { method: 'POST', headers: { Authorization: 'Bearer bad' } });
  assertEquals((await handler(bad)).status, 401);
  const good = new Request('http://x', {
    method: 'POST',
    headers: { Authorization: 'Bearer good' },
  });
  assertEquals(await (await handler(good)).text(), 'u1');
});

Deno.test('requireUser: lets CORS preflight through', async () => {
  const res = await handler(new Request('http://x', { method: 'OPTIONS' }));
  assertEquals(res.status, 200);
});

type FakeClaims = { sub?: string; role?: string };

/**
 * Stand-in for Supabase Auth: `getClaims` verifies tokens locally (as with the project's JWKS);
 * `getUser` is the per-request Auth round trip the verifier must no longer make (D-053).
 */
class FakeAuthClient {
  authLookups = 0;
  constructor(private readonly tokens: Record<string, FakeClaims>) {}
  auth = {
    getClaims: (token: string) =>
      Promise.resolve(
        this.tokens[token]
          ? { data: { claims: this.tokens[token]! }, error: null }
          : { data: null, error: new Error(`invalid JWT ${token}`) },
      ),
    getUser: () => {
      this.authLookups++;
      return Promise.resolve({ data: { user: null }, error: new Error('unexpected Auth lookup') });
    },
  };
}

const fakeClient = new FakeAuthClient({
  user: { sub: 'u1', role: 'authenticated' },
  anon: { role: 'anon' },
  service: { role: 'service_role' },
  nobody: { role: 'authenticated' },
});

Deno.test('supabaseUserVerifier: a user token is verified locally, with no Auth round trip', async () => {
  const verify = supabaseUserVerifier(fakeClient);
  assertEquals(await verify('user'), { id: 'u1' });
  assertEquals(fakeClient.authLookups, 0);
});

Deno.test('supabaseUserVerifier: the anon and service keys, tokens without a user and bad ones are rejected', async () => {
  const verify = supabaseUserVerifier(fakeClient);
  for (const token of ['anon', 'service', 'nobody', 'forged']) {
    assertEquals(await verify(token), null, token);
  }
});
