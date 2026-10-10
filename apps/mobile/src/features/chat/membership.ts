/**
 * Who is in a walk list's group chat (D-043; the database decides with `is_walk_chat_member`):
 * its organiser, and everyone going while the list is public.
 * @example isChatMember({ isOwner: false, isAttending: true, visibility: 'public' }) // true
 */
export function isChatMember(trip: {
  isOwner: boolean;
  isAttending: boolean;
  visibility: string;
}): boolean {
  return trip.isOwner || (trip.isAttending && trip.visibility === 'public');
}

/** The chat screen of a walk list (a query parameter: static hosts need no rewrite rule). */
export const walkChatHref = (tripId: string) =>
  ({ pathname: '/walk-chat', params: { id: tripId } }) as const;
