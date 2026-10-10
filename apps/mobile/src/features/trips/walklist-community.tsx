// Community pieces of a walk list page (D-035): who made it, its rating and Save, and the
// moderators' official badge toggle.
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { Badge } from '@/components/card';
import { Section } from '@/components/screen';
import { Text } from '@/components/text';
import type { RatingSummary } from '@/features/reviews/api';
import { RatingSummaryLine } from '@/features/reviews/components';
import type { TripVisibility } from '@wayfarer/shared';
import { useIsModerator, useSetTripOfficial } from '@/features/trips/community-api';
import { SaveWalklistButton } from '@/features/trips/save-walklist-button';
import { authorLabel } from '@/features/trips/trip-card';
import { spacing } from '@/theme/colors';

type CommunityTrip = {
  id: string;
  name: string;
  authorName: string | null;
  isOfficial: boolean;
  rating: RatingSummary;
  isSaved: boolean;
  isOwner: boolean;
};

/**
 * "Official · by Travelist" or "by Ana", the rating, and Save for signed-in visitors.
 * @example <WalklistByline trip={shared} canSave={signedIn} />
 */
export function WalklistByline({ trip, canSave }: { trip: CommunityTrip; canSave: boolean }) {
  const { t } = useTranslation();
  return (
    <View style={styles.byline}>
      <View style={styles.row}>
        {trip.isOfficial ? (
          <Badge icon="verified" tone="accent" label={t('walklists.official')} />
        ) : null}
        <Text variant="subtitle" secondary>
          {authorLabel(trip, t)}
        </Text>
      </View>
      <RatingSummaryLine summary={trip.rating} />
      {canSave ? <SaveWalklistButton trip={{ ...trip, isOwn: trip.isOwner }} /> : null}
    </View>
  );
}

/**
 * For moderators only: mark a public list official or remove the badge.
 * @example <ModeratorOfficialToggle trip={trip} />
 */
export function ModeratorOfficialToggle({
  trip,
}: {
  trip: { id: string; visibility: TripVisibility; isOfficial: boolean };
}) {
  const { t } = useTranslation();
  const moderator = useIsModerator();
  const setOfficial = useSetTripOfficial(trip.id);
  if (!moderator.data) return null;
  return (
    <Section title={t('walklists.moderatorTitle')}>
      {trip.visibility === 'public' ? (
        <View style={styles.row}>
          <Button
            variant="secondary"
            icon="verified"
            label={t(trip.isOfficial ? 'walklists.unmarkOfficial' : 'walklists.markOfficial')}
            loading={setOfficial.isPending}
            onPress={() => setOfficial.mutate(!trip.isOfficial)}
          />
        </View>
      ) : (
        <Text secondary>{t('walklists.officialNeedsPublic')}</Text>
      )}
      {setOfficial.error ? <Text secondary>{t('errors.generic')}</Text> : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  byline: { gap: spacing.sm, alignItems: 'flex-start' },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
});
