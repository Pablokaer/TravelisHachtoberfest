import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { useToggleSavedWalklist } from '@/features/trips/community-api';

type SavableList = { id: string; name: string; isSaved: boolean; isOwn: boolean };

/**
 * Save / Saved toggle for another traveller's list (D-035): adds it to My Trips → Saved, or
 * removes it. Nothing for the user's own lists, which are in My Trips already.
 * @example <SaveWalklistButton trip={list} />
 */
export function SaveWalklistButton({ trip }: { trip: SavableList }) {
  const { t } = useTranslation();
  const toggle = useToggleSavedWalklist();
  if (trip.isOwn) return null;
  return (
    <Button
      compact
      variant={trip.isSaved ? 'secondary' : 'ghost'}
      icon={trip.isSaved ? 'bookmarked' : 'bookmark'}
      label={trip.isSaved ? t('walklists.saved') : t('walklists.save')}
      accessibilityLabel={t(trip.isSaved ? 'walklists.unsaveLabel' : 'walklists.saveLabel', {
        name: trip.name,
      })}
      accessibilityState={{ selected: trip.isSaved }}
      loading={toggle.isPending}
      onPress={() => toggle.mutate({ id: trip.id, saved: !trip.isSaved })}
    />
  );
}
