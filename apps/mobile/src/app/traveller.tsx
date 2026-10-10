// A traveller's public profile (D-045), /traveller?id=<public id>: opened from the author's name
// on a review or chat message. Name, photo, member since and their public walk lists.
import { Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Screen, Section } from '@/components/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Text } from '@/components/text';
import { WrapGrid } from '@/components/wrap-grid';
import { useCities } from '@/features/destinations/api';
import { usePublicProfile, type PublicProfile } from '@/features/profile/public-profile-api';
import { WalklistCardWithActions } from '@/features/trips/city-walklists-section';
import { useWalklistPages } from '@/features/trips/community-api';
import { spacing } from '@/theme/colors';

function ProfileHeader({ profile }: { profile: PublicProfile }) {
  const { t } = useTranslation();
  const name = profile.name ?? t('reviews.anonymous');
  const since = new Intl.DateTimeFormat(t('common.locale'), {
    month: 'long',
    year: 'numeric',
  }).format(new Date(profile.memberSince));
  return (
    <View style={styles.header}>
      <View testID="traveller-avatar">
        <Avatar name={name} uri={profile.avatarUrl} size={96} />
      </View>
      <View style={styles.headerText}>
        <Text variant="display" accessibilityRole="header">
          {name}
        </Text>
        <Text secondary>{t('traveller.memberSince', { date: since })}</Text>
        <Text secondary>{t('traveller.walklists', { count: profile.publicWalklistCount })}</Text>
      </View>
    </View>
  );
}

function PublicWalklists({ profile }: { profile: PublicProfile }) {
  const { t } = useTranslation();
  const cities = useCities();
  const lists = useWalklistPages({ authorPublicId: profile.publicId, sort: 'newest' });
  const items = lists.data?.pages.flat() ?? [];
  const cityOf = (slug: string) => cities.data?.find((c) => c.slug === slug);
  if (lists.isPending) return <LoadingState />;
  if (lists.isError)
    return <ErrorState message={t('walklists.error')} onRetry={() => lists.refetch()} />;
  if (items.length === 0) return <EmptyState icon="route" title={t('traveller.noWalklists')} />;
  return (
    <>
      <WrapGrid
        items={items}
        keyOf={(list) => list.id}
        renderItem={(list) => {
          const city = cityOf(list.citySlug);
          return city ? (
            <WalklistCardWithActions list={list} city={city} />
          ) : (
            <Text>{list.name}</Text>
          );
        }}
      />
      {lists.hasNextPage ? (
        <Button
          variant="secondary"
          label={t('walklists.loadMore')}
          loading={lists.isFetchingNextPage}
          onPress={() => void lists.fetchNextPage()}
        />
      ) : null}
    </>
  );
}

export default function TravellerScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { t } = useTranslation();
  const profile = usePublicProfile(id);
  if (profile.isPending) return <LoadingState />;
  if (profile.isError) return <ErrorState onRetry={() => profile.refetch()} />;
  if (profile.data.status !== 'ok')
    return (
      <EmptyState
        icon="person"
        title={t('traveller.notFound')}
        body={t('traveller.notFoundBody')}
      />
    );
  const p = profile.data.profile;
  return (
    <Screen edges={['left', 'right']} width="wide">
      <Stack.Screen options={{ title: p.name ?? t('traveller.title') }} />
      <ProfileHeader profile={p} />
      {p.isSelf ? (
        <Card muted>
          <Text>{t('traveller.self')}</Text>
        </Card>
      ) : null}
      <Section title={t('traveller.walklistsTitle')}>
        <PublicWalklists profile={p} />
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.lg },
  headerText: { flex: 1, minWidth: 200, gap: spacing.xs },
});
