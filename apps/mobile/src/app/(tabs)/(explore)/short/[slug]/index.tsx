import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Screen, Section } from '@/components/screen';
import { ErrorState, LoadingState } from '@/components/states';
import { Text } from '@/components/text';
import { BeforeYouGoSection } from '@/features/checklist/before-you-go-section';
import { cityName, useCities, type City } from '@/features/destinations/api';
import { useCityAbout } from '@/features/destinations/city-about-api';
import { CityHero } from '@/features/destinations/city-hero';
import { CityNotFound } from '@/features/destinations/city-not-found';
import { usePrefetchCityPlaces } from '@/features/destinations/use-prefetch-city-places';
import { WikipediaTextBlock } from '@/features/destinations/wikipedia-texts';
import { NotablePeopleSection } from '@/features/people/notable-people-section';
import { ReviewsSection } from '@/features/reviews/reviews-section';
import { CityWalklistsSection } from '@/features/trips/city-walklists-section';
import { UpcomingMeetupsSection } from '@/features/trips/upcoming-meetups-section';

/**
 * City page (`/short/[slug]`, D-033): the hub of a city, opened from its card on the Home —
 * photo, rating, About, famous people (D-071), upcoming meetups (D-041), community and official walk lists, Before you
 * go and reviews.
 * "Explore attractions" opens the Map / List page (`/city/[slug]`).
 */
export default function CityHubScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const cities = useCities();
  const city = cities.data?.find((c) => c.slug === slug);

  if (cities.isPending) return <LoadingState />;
  if (cities.isError) return <ErrorState onRetry={() => cities.refetch()} />;
  if (!city) return <CityNotFound />;
  return <CityHub city={city} />;
}

function CityHub({ city }: { city: City }) {
  const { t, i18n } = useTranslation();
  // The Map / List page is one tap away: its places are loading while this page is read.
  usePrefetchCityPlaces(city);
  const openAttractions = () =>
    router.push({ pathname: '/city/[slug]', params: { slug: city.slug } });
  return (
    <Screen edges={['left', 'right']} width="wide">
      <Stack.Screen
        options={{ headerShown: true, title: cityName(city, i18n.resolvedLanguage ?? 'en') }}
      />
      <CityHero city={city} onExplore={openAttractions} />
      <AboutSection city={city} />
      <NotablePeopleSection city={city} />
      <UpcomingMeetupsSection city={city} />
      <CityWalklistsSection city={city} kind="community" />
      <CityWalklistsSection city={city} kind="official" />
      <BeforeYouGoSection citySlug={city.slug} />
      <ReviewsSection target={{ kind: 'city', id: city.slug }} />
      <Text variant="helper" secondary>
        {t('attraction.dataCredit')}
      </Text>
    </Screen>
  );
}

function AboutSection({ city }: { city: City }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  const about = useCityAbout(city.slug, lang);
  const empty = !about.isPending && !about.data?.summary && !about.data?.history;
  return (
    <Section title={t('cityHub.about', { city: cityName(city, lang) })}>
      {about.isPending ? <LoadingState /> : null}
      {about.data ? <WikipediaTextBlock texts={about.data} /> : null}
      {empty ? <Text secondary>{t('cityHub.noAbout')}</Text> : null}
    </Section>
  );
}
