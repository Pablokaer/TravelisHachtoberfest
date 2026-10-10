import { assertEquals, assertRejects } from 'jsr:@std/assert@1';

import type { SupabaseClient } from '@supabase/supabase-js';

import { supabaseProfileLanguage } from './profile-language.ts';

/** Typed as the Supabase client the adapter takes; it only ever calls the chain below. */
const asClient = (fake: FakeProfilesTable): SupabaseClient => fake as unknown as SupabaseClient;

/** The one PostgREST chain the reader uses: from('profiles').select().eq().maybeSingle(). */
class FakeProfilesTable {
  readonly filters: string[] = [];
  constructor(private readonly answer: { data: { language: string } | null; error: unknown }) {}
  from(table: string) {
    this.filters.push(table);
    return {
      select: (columns: string) => {
        this.filters.push(columns);
        return {
          eq: (column: string, value: string) => {
            this.filters.push(`${column}=${value}`);
            return { maybeSingle: () => Promise.resolve(this.answer) };
          },
        };
      },
    };
  }
}

Deno.test('reads the language of the profile with the user id', async () => {
  const table = new FakeProfilesTable({ data: { language: 'pt' }, error: null });
  assertEquals(await supabaseProfileLanguage(asClient(table))('u1'), 'pt');
  assertEquals(table.filters, ['profiles', 'language', 'id=u1']);
});

Deno.test('a missing profile reads as null', async () => {
  const table = new FakeProfilesTable({ data: null, error: null });
  assertEquals(await supabaseProfileLanguage(asClient(table))('u1'), null);
});

Deno.test('a database error rejects with its message', async () => {
  const table = new FakeProfilesTable({ data: null, error: { message: 'boom' } });
  await assertRejects(() => supabaseProfileLanguage(asClient(table))('u1'), Error, 'boom');
});
