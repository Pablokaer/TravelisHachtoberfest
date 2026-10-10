import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { PageHeader, Screen } from '@/components/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Text } from '@/components/text';
import { cityName } from '@/features/destinations/api';
import { CityHero } from '@/features/destinations/city-hero';
import { useRouteStore } from '@/features/route/store';
import type { SuggestedRoute } from '@/features/suggested/api';
import { BuildProgress } from '@/features/suggested/build-progress';
import { CityChooser } from '@/features/suggested/city-chooser';
import { SavedCities } from '@/features/suggested/saved-cities';
import { useSavedPlaces } from '@/features/suggested/saved-places';
import { SuggestedRouteCard } from '@/features/suggested/suggested-route-card';
import { useRoutesHere, type RoutesHere } from '@/features/suggested/use-routes-here';
import { spacing } from '@/theme/colors';

const openStop = (id: string) => router.push({ pathname: '/attraction/[id]', params: { id } });
const openCityMap = (slug: string) => router.push({ pathname: '/city/[slug]', params: { slug } });

/** The city builder is still looking up or preparing the traveller's own city (D-079). */
const isPreparing = (here: RoutesHere) =>
  here.own.phase === 'resolving' || here.own.phase === 'building';

/** Loads the route into the tray, already ordered from the traveller, and opens the builder. */
function startRoute(route: Pick<SuggestedRoute, 'stops'>) {
  useRouteStore.getState().startRoute(route.stops);
  router.push('/route');
}

/** Why the traveller is being asked to choose a city, when there is a reason. */
function useNotice(here: RoutesHere): string | null {
  const { t } = useTranslation();
  if (here.status === 'denied') return t('suggested.denied');
  if (here.status === 'error') return t('suggested.error');
  if (here.own.phase === 'failed') return t('suggested.buildFailed', { message: here.own.message });
  if (here.outOfCoverage) return t('suggested.outOfCoverage');
  return null;
}

function LocationBar({ here, onToggleChooser }: { here: RoutesHere; onToggleChooser: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.bar}>
      <Button
        icon="pin"
        label={t('suggested.useLocation')}
        loading={here.status === 'locating'}
        onPress={here.locate}
      />
      <Button
        variant="secondary"
        icon="search"
        label={here.city ? t('suggested.changeCity') : t('suggested.chooseCity')}
        onPress={onToggleChooser}
      />
    </View>
  );
}

/** The saved cities (D-080) that the app still has, as a drop-down. */
function SavedPlacesPicker({ here }: { here: RoutesHere }) {
  const slugs = useSavedPlaces((state) => state.slugs);
  const saved = slugs.flatMap((slug) => here.cities.find((c) => c.slug === slug) ?? []);
  return (
    <SavedCities
      cities={saved}
      currentSlug={here.city?.slug ?? null}
      onPick={(city) =>
        here.setTypedPlace(
          { lat: city.lat, lng: city.lng },
          { name: city.nameEn, countryCode: city.countryCode },
        )
      }
    />
  );
}

function Routes({ here }: { here: RoutesHere }) {
  const { t, i18n } = useTranslation();
  const { city, routes, ranked, position, own } = here;
  if (isPreparing(here)) return <BuildProgress own={own} />;
  if (own.phase === 'ready' && !city) return <LoadingState />;
  if (!city) return null;
  const place = cityName(city, i18n.resolvedLanguage ?? 'en');
  if (routes.isPending) return <LoadingState />;
  if (routes.isError) return <ErrorState onRetry={() => routes.refetch()} />;
  const heading = position && !here.chosenCity ? 'suggested.nearYou' : 'suggested.inCity';
  return (
    <View style={styles.routes}>
      <CityHero city={city} onExplore={() => openCityMap(city.slug)} />
      <Text variant="heading">{t(heading, { city: place })}</Text>
      {ranked.length === 0 ? (
        <EmptyState icon="route" title={t('suggested.empty', { city: place })} />
      ) : (
        ranked.map((route) => (
          <SuggestedRouteCard
            key={route.id}
            route={route}
            showStartDistance={!!position}
            onStart={() => startRoute(route)}
            onOpenStop={openStop}
          />
        ))
      )}
    </View>
  );
}

/**
 * Suggested routes (D-077): themed historic walks of the city the traveller is in (GPS) or picked,
 * each starting at the stop nearest to them, nearest route first.
 */
export default function SuggestedRoutesScreen() {
  const { t } = useTranslation();
  const here = useRoutesHere();
  const notice = useNotice(here);
  const [choosing, setChoosing] = useState(false);
  const showChooser = choosing || (!here.city && !isPreparing(here));
  return (
    <Screen>
      <PageHeader title={t('suggested.title')} subtitle={t('suggested.subtitle')} />
      <View style={styles.body}>
        <LocationBar here={here} onToggleChooser={() => setChoosing((open) => !open)} />
        <SavedPlacesPicker here={here} />
        {notice ? <Text secondary>{notice}</Text> : null}
        {showChooser ? (
          <CityChooser
            cities={here.cities}
            onChoose={(slug) => {
              here.chooseCity(slug);
              setChoosing(false);
            }}
            onChoosePlace={(place) => {
              here.setTypedPlace(
                { lat: place.lat, lng: place.lng },
                { name: place.name, countryCode: place.countryCode },
              );
              setChoosing(false);
            }}
          />
        ) : null}
        {here.city || isPreparing(here) ? null : <IntroState />}
        <Routes here={here} />
      </View>
    </Screen>
  );
}

function IntroState() {
  const { t } = useTranslation();
  return <EmptyState icon="route" title={t('suggested.introTitle')} body={t('suggested.intro')} />;
}

const styles = StyleSheet.create({
  body: { gap: spacing.md },
  bar: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  routes: { gap: spacing.md },
});
