import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import {
  CHAT_OVERLAP_MS,
  CHAT_PAGE_SIZE,
  CHAT_PEOPLE_FALLBACK_MS,
  CHAT_PEOPLE_SHOWN,
  CHAT_RECONCILE_MS,
  useWalkPeopleLive,
  walkMessagesQuery,
  walkParticipantsQuery,
} from '@/features/chat/api';
import type { BroadcastSubscriber } from '@/lib/realtime';
import { useToggleAttendance } from '@/features/trips/community-api';
import { supabase } from '@/lib/supabase';

/** Fake `set_walk_attendance`: answers like the database, or fails like a lost network. */
class FakeAttendanceRpc {
  static calls: { fn: string; args: unknown }[] = [];
  static failWith: string | null = null;

  static reset() {
    FakeAttendanceRpc.calls = [];
    FakeAttendanceRpc.failWith = null;
  }

  static call = async (fn: string, args: { p_attending: boolean }) => {
    FakeAttendanceRpc.calls.push({ fn, args });
    if (FakeAttendanceRpc.failWith)
      return { data: null, error: { message: FakeAttendanceRpc.failWith } };
    return { data: { is_attending: args.p_attending, attendee_count: 1 }, error: null };
  };
}

jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: jest.fn(), from: jest.fn() },
  unwrap: (r: { data: unknown; error: { message: string } | null }) => {
    if (r.error) throw new Error(r.error.message);
    return r.data;
  },
  check: (r: { error: { message: string } | null }) => {
    if (r.error) throw new Error(r.error.message);
  },
}));

function setup() {
  // No garbage-collection timers (5 min by default): they kept Jest from exiting after the run.
  const client = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  const invalidated: unknown[] = [];
  const original = client.invalidateQueries.bind(client);
  client.invalidateQueries = ((filters?: Parameters<typeof original>[0]) => {
    invalidated.push(filters?.queryKey);
    return original(filters);
  }) as typeof client.invalidateQueries;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { wrapper, invalidated };
}

beforeEach(() => {
  FakeAttendanceRpc.reset();
  jest.mocked(supabase.rpc).mockImplementation(FakeAttendanceRpc.call as never);
});

describe('joining a walk list (D-044)', () => {
  test('goes through the idempotent RPC and then refreshes what the screens show', async () => {
    const { wrapper, invalidated } = setup();
    const { result } = renderHook(() => useToggleAttendance(), { wrapper });
    await act(async () => result.current.mutate({ id: 't1', attending: true }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(FakeAttendanceRpc.calls).toEqual([
      { fn: 'set_walk_attendance', args: { p_trip_id: 't1', p_attending: true } },
    ]);
    expect(invalidated).toEqual(expect.arrayContaining([['walklists'], ['sharedTrip']]));
  });

  test('a failure is reported and the screens are refreshed from the server, not left guessing', async () => {
    FakeAttendanceRpc.failWith = 'Failed to fetch';
    const { wrapper, invalidated } = setup();
    const { result } = renderHook(() => useToggleAttendance(), { wrapper });
    await act(async () => result.current.mutate({ id: 't1', attending: true }));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Failed to fetch');
    expect(invalidated).toEqual(expect.arrayContaining([['sharedTrip']]));
  });
});

describe('the chat reconciles with the server (D-044)', () => {
  test('while open it re-reads the history regularly and on focus, so a missed live event still shows', () => {
    const options = walkMessagesQuery('t1');
    expect(options.queryKey).toEqual(['walkChat', 't1']);
    expect(options.refetchInterval).toBe(CHAT_RECONCILE_MS);
    expect(CHAT_RECONCILE_MS).toBe(10_000);
    expect(options.refetchOnWindowFocus).toBe('always');
    expect(options.staleTime).toBe(0);
  });
});

/** Fake `list_walk_messages`: the newest messages first, only those after `p_after` if given. */
class FakeChatRpc {
  static rows: { id: string; body: string; created_at: string }[] = [];
  static calls: { p_trip_id: string; p_limit: number; p_after?: string }[] = [];

  static reset(count = 2) {
    FakeChatRpc.calls = [];
    FakeChatRpc.rows = Array.from({ length: count }, (_, i) => FakeChatRpc.row(i));
  }

  /** Message `i`, written at 09:00 + i minutes. */
  static row(i: number) {
    const at = new Date(Date.UTC(2026, 9, 1, 9, i)).toISOString();
    return { id: `m${i}`, body: `Message ${i}`, created_at: at };
  }

  static call = async (_fn: string, args: (typeof FakeChatRpc.calls)[number]) => {
    FakeChatRpc.calls.push(args);
    const after = args.p_after ? Date.parse(args.p_after) : -Infinity;
    const rows = FakeChatRpc.rows
      .filter((r) => Date.parse(r.created_at) > after)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, args.p_limit);
    return { data: rows.map((r) => ({ ...r, author_name: null, is_own: false })), error: null };
  };
}

describe('the chat reads only what is new (D-056)', () => {
  // No garbage-collection timers and no retries: nothing outlives the test.
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });
  beforeEach(() => {
    FakeChatRpc.reset();
    jest.mocked(supabase.rpc).mockImplementation(FakeChatRpc.call as never);
  });
  afterEach(() => client.clear());
  const ids = (messages: { id: string }[] | undefined) => messages?.map((m) => m.id);

  test('after the first read, a refetch asks only for messages after the newest one known', async () => {
    await client.fetchQuery(walkMessagesQuery('t1'));
    FakeChatRpc.rows.push(FakeChatRpc.row(2));
    const messages = await client.fetchQuery(walkMessagesQuery('t1'));
    expect(ids(messages)).toEqual(['m0', 'm1', 'm2']);
    // Re-reads a little before the newest message: a message may be stamped before it but saved after.
    const newest = Date.parse(FakeChatRpc.row(1).created_at);
    expect(FakeChatRpc.calls[1]).toEqual({
      p_trip_id: 't1',
      p_limit: CHAT_PAGE_SIZE,
      p_after: new Date(newest - CHAT_OVERLAP_MS).toISOString(),
    });
  });

  test('messages read again are not shown twice', async () => {
    await client.fetchQuery(walkMessagesQuery('t1'));
    const messages = await client.fetchQuery(walkMessagesQuery('t1'));
    expect(ids(messages)).toEqual(['m0', 'm1']);
  });

  test('a full page of new messages replaces the list: that page is the newest one', async () => {
    await client.fetchQuery(walkMessagesQuery('t1'));
    for (let i = 2; i < CHAT_PAGE_SIZE + 3; i++) FakeChatRpc.rows.push(FakeChatRpc.row(i));
    const messages = await client.fetchQuery(walkMessagesQuery('t1'));
    // Not old messages, then a gap, then the newest: just the newest page, as a fresh open shows.
    expect(messages).toHaveLength(CHAT_PAGE_SIZE);
    expect(ids(messages)?.[0]).toBe('m3');
    expect(ids(messages)?.at(-1)).toBe(`m${CHAT_PAGE_SIZE + 2}`);
  });
});

/** Fake `list_walk_participants`: the first `p_limit` of 12 people, each row with the count. */
class FakePeopleRpc {
  static calls: { fn: string; args: unknown }[] = [];

  static call = async (fn: string, args: { p_limit: number }) => {
    FakePeopleRpc.calls.push({ fn, args });
    const names = ['Ana', 'Ben', 'Cid', 'Dee', 'Eve', 'Fay', 'Gus'].slice(0, args.p_limit);
    const rows = names.map((name, i) => ({
      name,
      avatar_path: null,
      is_organiser: i === 0,
      is_self: name === 'Cid',
      participant_count: 12,
    }));
    return { data: rows, error: null };
  };
}

/** Records what `useWalkPeopleLive` follows and lets the test fire its events. */
class FakeBroadcasts {
  followed: { topic: string; event: string; onEvent: () => void }[] = [];
  stopped = 0;

  subscribe: BroadcastSubscriber = (topic, event, onEvent) => {
    this.followed.push({ topic, event, onEvent });
    return () => void this.stopped++;
  };
}

describe('the people in a chat (D-061)', () => {
  beforeEach(() => {
    FakePeopleRpc.calls = [];
    jest.mocked(supabase.rpc).mockImplementation(FakePeopleRpc.call as never);
  });

  test('only the first few are read, with the count of everyone', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
    const people = await client.fetchQuery(walkParticipantsQuery('t1'));
    expect(FakePeopleRpc.calls).toEqual([
      { fn: 'list_walk_participants', args: { p_trip_id: 't1', p_limit: CHAT_PEOPLE_SHOWN } },
    ]);
    expect(CHAT_PEOPLE_SHOWN).toBe(5);
    expect(people.total).toBe(12);
    expect(people.shown.map((p) => p.name)).toEqual(['Ana', 'Ben', 'Cid', 'Dee', 'Eve']);
    expect(people.shown[0]).toEqual({
      name: 'Ana',
      avatarUrl: null,
      isOrganiser: true,
      isSelf: false,
    });
    expect(people.shown[2]?.isSelf).toBe(true);
    client.clear();
  });

  test('a chat nobody can read has no people', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as never);
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
    expect(await client.fetchQuery(walkParticipantsQuery('t1'))).toEqual({ total: 0, shown: [] });
    client.clear();
  });

  test('they are re-read when someone joins or leaves, with only a slow poll as a safety net', () => {
    const options = walkParticipantsQuery('t1');
    expect(options.refetchInterval).toBe(CHAT_PEOPLE_FALLBACK_MS);
    expect(CHAT_PEOPLE_FALLBACK_MS).toBe(300_000);
    // Apart from the messages' key: a new message does not re-read the people.
    expect(options.queryKey).toEqual(['walkChatPeople', 't1']);
  });

  test("a join or leave on the list's topic refreshes the people, until the chat closes", () => {
    const { wrapper, invalidated } = setup();
    const broadcasts = new FakeBroadcasts();
    const { unmount } = renderHook(() => useWalkPeopleLive('t1', broadcasts.subscribe), {
      wrapper,
    });
    expect(broadcasts.followed).toMatchObject([{ topic: 'walk-people:t1', event: 'changed' }]);
    act(() => broadcasts.followed[0]!.onEvent());
    expect(invalidated).toEqual([['walkChatPeople', 't1']]);
    unmount();
    expect(broadcasts.stopped).toBe(1);
  });
});
