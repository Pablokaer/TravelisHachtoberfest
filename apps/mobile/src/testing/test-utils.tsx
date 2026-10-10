import type { Session } from '@supabase/supabase-js';

/** Minimal chainable mock of the Supabase query builder. */
export function queryResult(data: unknown) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const m of ['select', 'eq', 'gt', 'in', 'order', 'update', 'delete', 'insert'])
    builder[m] = jest.fn(chain);
  builder.single = jest.fn(async () => ({ data, error: null }));
  builder.maybeSingle = jest.fn(async () => ({ data, error: null }));
  builder.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data, error: null }).then(resolve);
  return builder;
}

export const fakeSession = {
  access_token: 'token',
  refresh_token: 'refresh',
  expires_in: 3600,
  token_type: 'bearer',
  user: {
    id: 'user-1',
    email: 'traveller@example.com',
    aud: 'authenticated',
    app_metadata: {},
    user_metadata: {},
    created_at: '',
  },
} as unknown as Session;
