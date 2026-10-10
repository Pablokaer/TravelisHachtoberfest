// The walk list previews of the city page (D-035): the best rated community lists, and the
// official ones, each a few cards with View / Save and a way to the full list.
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { centring, useCentredOnPhone } from '@/components/phone-centring';
import { Section } from '@/components/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Text } from '@/components/text';
import { WrapGrid } from '@/components/wrap-grid';
import { cityName, type City } from '@/features/destinations/api';
import { useWalklistPreview, type WalklistCard } from '@/features/trips/community-api';
import { SaveWalklistButton } from '@/features/trips/save-walklist-button';
import { TripCard } from '@/features/trips/trip-card';
import { spacing } from '@/theme/colors';

type Kind = 'community' | 'official';

/** Other people's lists open read-only by their link, where they can be rated (D-031). */
export const openWalklist = (id: string) => router.push({ pathname: '/shared', params: { id } });

/**
 * A walk list card with its View and Save actions.
 * @example <WalklistCardWithActions list={list} city={lisbon} />
 */
export function WalklistCardWithActions({ list, city }: { list: WalklistCard; city: City }) {
  const { t } = useTranslation();
  return (
    <TripCard
      trip={list}
      city={city}
      onPress={() => openWalklist(list.id)}
      actions={
        <>
          <Button
            compact
            variant="secondary"
            label={t('walklists.view')}
            accessibilityLabel={`${t('walklists.view')} ${list.name}`}
            onPress={() => openWalklist(list.id)}
          />
          <SaveWalklistButton trip={list} />
        </>
      }
    />
  );
}

function PreviewBody({ city, kind }: { city: City; kind: Kind }) {
  const { t, i18n } = useTranslation();
  const preview = useWalklistPreview({ citySlug: city.slug, official: kind === 'official' });
  if (preview.isPending) return <LoadingState />;
  if (preview.isError)
    return <ErrorState message={t('walklists.error')} onRetry={() => preview.refetch()} />;
  if (preview.data.items.length === 0) {
    const name = cityName(city, i18n.resolvedLanguage ?? 'en');
    return (
      <EmptyState
        icon={kind === 'official' ? 'verified' : 'route'}
        title={t(kind === 'official' ? 'walklists.officialEmpty' : 'walklists.communityEmpty')}
        body={t(
          kind === 'official' ? 'walklists.officialEmptyBody' : 'walklists.communityEmptyBody',
          { city: name },
        )}
      />
    );
  }
  return (
    <>
      <WrapGrid
        items={preview.data.items}
        keyOf={(list) => list.id}
        renderItem={(list) => <WalklistCardWithActions list={list} city={city} />}
      />
      <ViewAll city={city} kind={kind} show={kind === 'community' || preview.data.hasMore} />
    </>
  );
}

function ViewAll({ city, kind, show }: { city: City; kind: Kind; show: boolean }): ReactNode {
  const { t } = useTranslation();
  if (!show) return null;
  const open = () =>
    router.push({
      pathname: '/short/[slug]/walklists',
      params: kind === 'official' ? { slug: city.slug, kind } : { slug: city.slug },
    });
  return (
    <View style={styles.viewAll}>
      <Button
        variant="secondary"
        icon="list"
        label={t(kind === 'official' ? 'walklists.viewAllOfficial' : 'walklists.viewAll')}
        onPress={open}
      />
    </View>
  );
}

/**
 * @example <CityWalklistsSection city={lisbon} kind="official" />
 */
export function CityWalklistsSection({ city, kind }: { city: City; kind: Kind }) {
  const { t } = useTranslation();
  const centred = useCentredOnPhone();
  return (
    <View testID={`walklists-${kind}`}>
      <Section
        title={t(kind === 'official' ? 'walklists.officialTitle' : 'walklists.communityTitle')}>
        {kind === 'official' ? (
          <Text secondary style={centred && centring.text}>
            {t('walklists.officialSubtitle')}
          </Text>
        ) : null}
        <PreviewBody city={city} kind={kind} />
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  viewAll: { flexDirection: 'row', marginTop: spacing.xs },
});
