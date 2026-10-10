// Walk list group chat (D-043): the organiser and everyone going share one chat per list. Read
// with `list_walk_messages` (author names and photos), written as plain inserts (RLS: members
// only), delivered live through Realtime inserts. Who is in it: `list_walk_participants`, re-read
// when the list's private topic announces a join or leave (D-061).
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { avatarUrl } from '@/features/profile/avatar-api';
import {
  subscribeToBroadcasts,
  subscribeToInserts,
  type BroadcastSubscriber,
  type InsertSubscriber,
} from '@/lib/realtime';
import { check, supabase, unwrap } from '@/lib/supabase';

/** Newest messages loaded when a chat opens. */
export const CHAT_PAGE_SIZE = 100;
/**
 * While a chat is open it is re-read this often (D-044). Realtime delivers messages at most once:
 * an event can be lost (the service starting or reconnecting, a device asleep), and without
 * this the message would not show until someone wrote again. Each re-read asks only for what is
 * new (D-056).
 */
export const CHAT_RECONCILE_MS = 10_000;
/** People named in the chat header; the rest are counted (D-061). */
export const CHAT_PEOPLE_SHOWN = 5;
/**
 * The people in a chat are re-read when its topic announces a join or leave (D-061). This slow
 * re-read only catches what that misses: an announcement lost while reconnecting, a new name or
 * photo, a list made private.
 */
export const CHAT_PEOPLE_FALLBACK_MS = 300_000;
/**
 * A re-read starts this long before the newest message shown: a message is stamped when its
 * transaction starts, so it can be saved just after a newer one was read (D-056).
 */
export const CHAT_OVERLAP_MS = 60_000;
/** Longest message, in characters (mirrored by a DB check). */
export const CHAT_MESSAGE_MAX = 1000;

export type ChatMessage = {
  id: string;
  body: string;
  createdAt: string;
  authorName: string | null;
  authorAvatarUrl: string | null;
  /** Opens the author's public profile (D-045). */
  authorPublicId: string | null;
  /** Shown as @nickname on every message, own ones included (D-048). */
  authorNickname: string | null;
  isOwn: boolean;
};

type MessageRow = {
  id: string;
  body: string;
  created_at: string;
  author_name: string | null;
  author_avatar_path: string | null;
  is_own: boolean;
  author_public_id?: string | null;
  author_nickname?: string | null;
};

export const chatKeys = {
  messages: (tripId: string) => ['walkChat', tripId] as const,
  // Not under `messages`: each new message refetches those, and should not re-read the people.
  people: (tripId: string) => ['walkChatPeople', tripId] as const,
};

/**
 * @example messageFromRow(row).authorName // 'Ben'
 */
export function messageFromRow(r: MessageRow): ChatMessage {
  return {
    id: r.id,
    body: r.body,
    createdAt: r.created_at,
    authorName: r.author_name,
    authorAvatarUrl: avatarUrl(r.author_avatar_path),
    authorPublicId: r.author_public_id ?? null,
    authorNickname: r.author_nickname ?? null,
    isOwn: r.is_own,
  };
}

/** The newest messages of a chat (only those after `after`, when given), oldest first. */
async function fetchMessages(tripId: string, after?: string): Promise<ChatMessage[]> {
  const rows = unwrap(
    await supabase.rpc('list_walk_messages', {
      p_trip_id: tripId,
      p_limit: CHAT_PAGE_SIZE,
      ...(after ? { p_after: after } : {}),
    }),
  );
  return (rows as MessageRow[]).map(messageFromRow).reverse();
}

/** Reading order, as the server's newest-first page reversed: oldest first, ties by id. */
const byReadingOrder = (a: ChatMessage, b: ChatMessage) =>
  Date.parse(a.createdAt) - Date.parse(b.createdAt) || b.id.localeCompare(a.id);

/**
 * `known` plus the messages of `newer` it lacks, in reading order; `known` itself (no re-render)
 * when nothing is new.
 * @example mergeMessages([m1, m2], [m2, m3]) // [m1, m2, m3]
 */
export function mergeMessages(known: ChatMessage[], newer: ChatMessage[]): ChatMessage[] {
  const seen = new Set(known.map((m) => m.id));
  const added = newer.filter((m) => !seen.has(m.id));
  return added.length ? [...known, ...added].sort(byReadingOrder) : known;
}

/**
 * Re-reads a chat already shown: only the messages since a little before its newest one. A full
 * page means more arrived than one read holds, so that page — the newest — replaces the list.
 */
async function readNewMessages(tripId: string, known: ChatMessage[]): Promise<ChatMessage[]> {
  const newest = Date.parse(known.at(-1)!.createdAt);
  const newer = await fetchMessages(tripId, new Date(newest - CHAT_OVERLAP_MS).toISOString());
  return newer.length >= CHAT_PAGE_SIZE ? newer : mergeMessages(known, newer);
}

/**
 * The chat query: the newest messages, oldest first (reading order), re-read when the chat opens
 * or regains focus, every `CHAT_RECONCILE_MS` while it is open and on each live event — after the
 * first read, only what is new (D-056).
 * @example useQuery(walkMessagesQuery(trip.id))
 */
export function walkMessagesQuery(tripId: string) {
  return {
    queryKey: chatKeys.messages(tripId),
    queryFn: ({ client }: { client: QueryClient }): Promise<ChatMessage[]> => {
      const known = client.getQueryData<ChatMessage[]>(chatKeys.messages(tripId));
      return known?.length ? readNewMessages(tripId, known) : fetchMessages(tripId);
    },
    staleTime: 0,
    refetchInterval: CHAT_RECONCILE_MS,
    refetchOnWindowFocus: 'always' as const,
  };
}

/** The chat's newest messages, kept in step with the server (see `walkMessagesQuery`). */
export function useWalkMessages(tripId: string) {
  return useQuery(walkMessagesQuery(tripId));
}

export type ChatParticipant = {
  name: string | null;
  avatarUrl: string | null;
  isOrganiser: boolean;
  isSelf: boolean;
};

/** How many people are in the chat, and the first few of them. */
export type ChatPeople = { total: number; shown: ChatParticipant[] };

type ParticipantRow = {
  name: string | null;
  avatar_path: string | null;
  is_organiser: boolean;
  is_self: boolean;
  participant_count: number;
};

/**
 * @example peopleFromRows([]) // { total: 0, shown: [] }
 */
function peopleFromRows(rows: ParticipantRow[]): ChatPeople {
  return {
    total: rows[0]?.participant_count ?? 0,
    shown: rows.map((r) => ({
      name: r.name,
      avatarUrl: avatarUrl(r.avatar_path),
      isOrganiser: r.is_organiser,
      isSelf: r.is_self,
    })),
  };
}

/**
 * Who is in the chat: the count of everyone and the first `CHAT_PEOPLE_SHOWN` (the organiser
 * first, then participants in the order they joined).
 * @example useQuery(walkParticipantsQuery(trip.id)).data?.total
 */
export function walkParticipantsQuery(tripId: string) {
  return {
    queryKey: chatKeys.people(tripId),
    refetchInterval: CHAT_PEOPLE_FALLBACK_MS,
    queryFn: async (): Promise<ChatPeople> => {
      const rows = unwrap(
        await supabase.rpc('list_walk_participants', {
          p_trip_id: tripId,
          p_limit: CHAT_PEOPLE_SHOWN,
        }),
      );
      return peopleFromRows(rows as ParticipantRow[]);
    },
  };
}

/** Who is in the chat, kept in step with the server (see `walkParticipantsQuery`). */
export function useWalkParticipants(tripId: string) {
  return useQuery(walkParticipantsQuery(tripId));
}

/**
 * Re-reads who is in the chat whenever someone joins or leaves, while the screen is open.
 * @example useWalkPeopleLive(trip.id)
 */
export function useWalkPeopleLive(
  tripId: string,
  subscribe: BroadcastSubscriber = subscribeToBroadcasts,
) {
  const queryClient = useQueryClient();
  useEffect(
    () =>
      subscribe(`walk-people:${tripId}`, 'changed', () => {
        void queryClient.invalidateQueries({ queryKey: chatKeys.people(tripId) });
      }),
    [tripId, subscribe, queryClient],
  );
}

/**
 * Sends a message (trimmed; the caller checks it is not empty).
 * @example send.mutate('See you at 10', { onSuccess: clearField })
 */
export function useSendWalkMessage(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      check(await supabase.from('walk_messages').insert({ trip_id: tripId, body: body.trim() }));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: chatKeys.messages(tripId) }),
  });
}

/**
 * Refetches the chat whenever anyone posts in it, while the screen is open.
 * @example useWalkChatLive(trip.id)
 */
export function useWalkChatLive(tripId: string, subscribe: InsertSubscriber = subscribeToInserts) {
  const queryClient = useQueryClient();
  useEffect(
    () =>
      subscribe(`walk-chat:${tripId}`, 'walk_messages', `trip_id=eq.${tripId}`, () => {
        void queryClient.invalidateQueries({ queryKey: chatKeys.messages(tripId) });
      }),
    [tripId, subscribe, queryClient],
  );
}
