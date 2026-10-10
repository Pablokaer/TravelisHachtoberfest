// A thin, project-owned interface over Supabase Realtime (D-043): follow the inserts of one table,
// filtered, or the events of one private broadcast topic (D-061), and stop following. Realtime
// applies the table's select policy (or, for a private topic, realtime.messages') to each
// subscriber.
import { supabase } from '@/lib/supabase';

type Channel = {
  on(
    kind: 'postgres_changes',
    options: { event: 'INSERT'; schema: string; table: string; filter: string },
    callback: () => void,
  ): Channel;
  on(kind: 'broadcast', options: { event: string }, callback: () => void): Channel;
  subscribe: (onStatus?: (status: string) => void) => Channel;
};

/** What we need of the Supabase client, so tests can pass a fake. */
export type RealtimeClient = {
  channel: (name: string, options?: { config: { private: boolean } }) => Channel;
  removeChannel: (channel: never) => Promise<unknown>;
};

/**
 * Starts following inserts; returns the function that stops. `onInsert` also runs once the
 * server confirms it is listening, so a row inserted between the first read and that moment
 * is not missed.
 */
export type InsertSubscriber = (
  channelName: string,
  table: string,
  filter: string,
  onInsert: () => void,
) => () => void;

/**
 * Starts following one event of a private topic; returns the function that stops. Like inserts,
 * `onEvent` also runs once the server confirms it is listening.
 */
export type BroadcastSubscriber = (topic: string, event: string, onEvent: () => void) => () => void;

/** Subscribes a configured channel (`onEvent` again once listening) and returns its stop. */
function follow(client: RealtimeClient, channel: Channel, onEvent: () => void): () => void {
  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') onEvent();
  });
  return () => void client.removeChannel(channel as never);
}

/**
 * @example const followInserts = createInsertSubscriber(supabase);
 *          const stop = followInserts('walk-chat:t1', 'walk_messages', 'trip_id=eq.t1', refetch);
 */
export function createInsertSubscriber(client: RealtimeClient): InsertSubscriber {
  return (channelName, table, filter, onInsert) =>
    follow(
      client,
      client
        .channel(channelName)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter }, onInsert),
      onInsert,
    );
}

/**
 * @example const followTopic = createBroadcastSubscriber(supabase);
 *          const stop = followTopic('walk-people:t1', 'changed', refetchPeople);
 */
export function createBroadcastSubscriber(client: RealtimeClient): BroadcastSubscriber {
  return (topic, event, onEvent) =>
    follow(
      client,
      client.channel(topic, { config: { private: true } }).on('broadcast', { event }, onEvent),
      onEvent,
    );
}

/** The app's subscribers, on the shared Supabase client. */
export const subscribeToInserts = createInsertSubscriber(supabase as unknown as RealtimeClient);
export const subscribeToBroadcasts = createBroadcastSubscriber(
  supabase as unknown as RealtimeClient,
);
