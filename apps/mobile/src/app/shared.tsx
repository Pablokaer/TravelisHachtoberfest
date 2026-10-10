// A walk list opened by its link, /shared?id=<trip id> (D-031), signed in or not: public lists open straight away,
// protected ones ask for the password, private or missing ones are "not available". Community
// lists open here from the city page: author, rating, Save and reviews (D-035).
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Text } from '@/components/text';
import { useAuth } from '@/features/auth/auth-provider';
import { useProfile } from '@/features/profile/api';
import { ReviewsSection } from '@/features/reviews/reviews-section';
import { useSharedTrip, type SharedTripDetail } from '@/features/trips/sharing-api';
import { TripPasswordPrompt } from '@/features/trips/trip-password-prompt';
import { TripView } from '@/features/trips/trip-view';
import { MeetupBanner } from '@/features/trips/meetup-banner';
import { ModeratorOfficialToggle, WalklistByline } from '@/features/trips/walklist-community';
import { spacing } from '@/theme/colors';

const openStop = (id: string) => router.push({ pathname: '/attraction/[id]', params: { id } });

function OwnerNotice({ tripId }: { tripId: string }) {
  const { t } = useTranslation();
  return (
    <Card>
      <Text>{t('sharing.ownList')}</Text>
      <View style={styles.actions}>
        <Button
          variant="secondary"
          label={t('sharing.editOwn')}
          onPress={() => router.push({ pathname: '/trip/[id]', params: { id: tripId } })}
        />
      </View>
    </Card>
  );
}

function PlanYourOwn() {
  const { t } = useTranslation();
  return (
    <View style={styles.actions}>
      <Button label={t('sharing.planYourOwn')} onPress={() => router.push('/sign-up')} />
    </View>
  );
}

function OpenedTrip({ trip, signedIn }: { trip: SharedTripDetail; signedIn: boolean }) {
  const profile = useProfile();
  return (
    <TripView
      trip={trip}
      units={profile.data?.units ?? 'metric'}
      // Attraction pages need an account, like the rest of the app.
      onOpenStop={signedIn ? openStop : undefined}
      notice={
        <>
          <WalklistByline trip={trip} canSave={signedIn} />
          <MeetupBanner trip={trip} canJoin={signedIn} />
          {trip.isOwner ? <OwnerNotice tripId={trip.id} /> : null}
        </>
      }>
      {/* Reviews, like attraction reviews, need an account (D-028). */}
      {signedIn ? (
        <>
          <ReviewsSection target={{ kind: 'trip', id: trip.id }} canReview={!trip.isOwner} />
          <ModeratorOfficialToggle trip={trip} />
        </>
      ) : (
        <PlanYourOwn />
      )}
    </TripView>
  );
}

export default function SharedTripScreen() {
  // A query parameter, not /shared/[id]: static hosts serve shared.html without rewrite rules.
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { t } = useTranslation();
  const { session } = useAuth();
  const [password, setPassword] = useState<string | null>(null);
  const shared = useSharedTrip(id, password);

  if (shared.isPending) return <LoadingState />;
  if (shared.isError || !shared.data) return <ErrorState onRetry={() => shared.refetch()} />;
  const view = shared.data;
  if (view.status === 'ok') return <OpenedTrip trip={view.trip} signedIn={!!session} />;
  return (
    <Screen edges={['left', 'right']}>
      <Stack.Screen options={{ title: t('sharing.sharedTitle') }} />
      {view.status === 'not_found' ? (
        <EmptyState
          icon="lock"
          title={t('sharing.notFoundTitle')}
          body={t('sharing.notFoundBody')}
          action={session ? null : <PlanYourOwn />}
        />
      ) : (
        <TripPasswordPrompt
          onSubmit={setPassword}
          wrong={view.status === 'wrong_password'}
          checking={shared.isFetching}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
