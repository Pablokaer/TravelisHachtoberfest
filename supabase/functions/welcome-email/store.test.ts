import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import type { SupabaseClient } from '@supabase/supabase-js';

import { supabaseWelcomeStore } from './store.ts';

type RpcAnswer = { data: unknown; error: { message: string } | null };

/** Records RPC calls and answers each function with a fixed result. */
class FakeRpcClient {
  readonly calls: { fn: string; args: unknown }[] = [];
  constructor(private readonly answers: Record<string, RpcAnswer>) {}
  rpc(fn: string, args: unknown): Promise<RpcAnswer> {
    this.calls.push({ fn, args });
    return Promise.resolve(this.answers[fn] ?? { data: null, error: null });
  }
}

/** Typed as the Supabase client the store takes; it only ever calls `rpc`. */
const asClient = (fake: FakeRpcClient): SupabaseClient => fake as unknown as SupabaseClient;

Deno.test('claim maps the claimed row and passes the user id', async () => {
  const fake = new FakeRpcClient({
    claim_welcome_email: {
      data: [{ email: 'ana@example.com', language: 'pt', display_name: 'Ana' }],
      error: null,
    },
  });
  const claim = await supabaseWelcomeStore(asClient(fake)).claim('u1');
  assertEquals(claim, { email: 'ana@example.com', language: 'pt', displayName: 'Ana' });
  assertEquals(fake.calls, [{ fn: 'claim_welcome_email', args: { p_user: 'u1' } }]);
});

Deno.test('claim returns null when no row was claimed', async () => {
  const fake = new FakeRpcClient({ claim_welcome_email: { data: [], error: null } });
  assertEquals(await supabaseWelcomeStore(asClient(fake)).claim('u1'), null);
});

Deno.test('a database error rejects with its message and the user id', async () => {
  const fake = new FakeRpcClient({
    claim_welcome_email: { data: null, error: { message: 'boom' } },
  });
  await assertRejects(() => supabaseWelcomeStore(asClient(fake)).claim('u1'), Error, 'u1: boom');
});

Deno.test('release calls release_welcome_email for the user', async () => {
  const fake = new FakeRpcClient({});
  await supabaseWelcomeStore(asClient(fake)).release('u1');
  assertEquals(fake.calls, [{ fn: 'release_welcome_email', args: { p_user: 'u1' } }]);
});
