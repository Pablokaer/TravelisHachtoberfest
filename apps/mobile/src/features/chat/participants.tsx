// Who is in a walk list's group chat (D-044): "3 people: Ana (organiser), You, Cid". A big walk
// names its first few and counts the rest: "12 people: Ana (organiser), Ben, Cid, Dee, Eve, …"
// (D-061). Joins and leaves show live.
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/text';
import {
  useWalkParticipants,
  useWalkPeopleLive,
  type ChatParticipant,
  type ChatPeople,
} from '@/features/chat/api';

/** One name as the list shows it. */
function participantLabel(p: ChatParticipant, t: (key: string, values?: object) => string) {
  const name = p.isSelf ? t('chat.you') : (p.name ?? t('reviews.anonymous'));
  return p.isOrganiser ? t('chat.organiserTag', { name }) : name;
}

/** The names shown, then "…" when more people are counted than named. */
function peopleNames(people: ChatPeople, t: (key: string, values?: object) => string) {
  const names = people.shown.map((p) => participantLabel(p, t));
  return [...names, ...(people.total > names.length ? ['…'] : [])].join(', ');
}

/**
 * @example <ChatParticipants tripId={trip.id} />
 */
export function ChatParticipants({ tripId }: { tripId: string }) {
  const { t } = useTranslation();
  const people = useWalkParticipants(tripId);
  useWalkPeopleLive(tripId);
  if (!people.data?.shown.length) return null;
  return (
    <Text variant="caption" secondary testID="chat-participants">
      {t('chat.people', { count: people.data.total, names: peopleNames(people.data, t as never) })}
    </Text>
  );
}
