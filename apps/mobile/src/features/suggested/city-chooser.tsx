// Picks the place for suggested routes (D-077, D-080): a city the app has, or any city of the
// world found by name through the city builder, which then stands in for the traveller's position.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ListRow } from '@/components/list-row';
import { SearchField } from '@/components/search-field';
import { Text } from '@/components/text';
import { cityName, countryOf, type City } from '@/features/destinations/api';
import { searchCities } from '@/features/destinations/search';
import { spacing } from '@/theme/colors';
import type { PlaceMatch } from './city-builder';
import { defaultBuilder } from './default-builder';
import { SEARCH_MIN_LETTERS, useCitySearch } from './use-city-search';

/** Matches shown at once; typing narrows the rest. */
const MAX_MATCHES = 6;

type Props = {
  cities: City[];
  onChoose: (slug: string) => void;
  onChoosePlace: (place: PlaceMatch) => void;
};

/** Cities found online for the typed name: searching, none, not available, or the list. */
function WorldMatches({ query, onChoosePlace }: Pick<Props, 'onChoosePlace'> & { query: string }) {
  const { t } = useTranslation();
  const { available, isSearching, matches } = useCitySearch(query, defaultBuilder);
  if (query.trim().length < SEARCH_MIN_LETTERS) return null;
  const note = !available
    ? t('suggested.searchUnavailable')
    : isSearching
      ? t('suggested.searching')
      : matches.length === 0
        ? t('suggested.noPlaces', { query: query.trim() })
        : null;
  return (
    <View style={styles.box}>
      <Text variant="subtitle">{t('suggested.searchWorld')}</Text>
      {note ? <Text secondary>{note}</Text> : null}
      {matches.map((place) => (
        <ListRow
          key={`${place.name}-${place.lat}-${place.lng}`}
          icon="globe"
          label={place.name}
          value={place.displayName}
          onPress={() => onChoosePlace(place)}
        />
      ))}
    </View>
  );
}

/**
 * @example <CityChooser cities={cities} onChoose={chooseCity} onChoosePlace={setTypedPlace} />
 */
export function CityChooser({ cities, onChoose, onChoosePlace }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  const [query, setQuery] = useState('');
  const matches = searchCities(cities, query, lang).slice(0, MAX_MATCHES);
  return (
    <View style={styles.box}>
      <SearchField value={query} onChangeText={setQuery} label={t('suggested.searchCity')} />
      {matches.map((city) => (
        <ListRow
          key={city.slug}
          label={cityName(city, lang)}
          value={countryOf(city, lang)}
          onPress={() => onChoose(city.slug)}
        />
      ))}
      <WorldMatches query={query} onChoosePlace={onChoosePlace} />
    </View>
  );
}

const styles = StyleSheet.create({ box: { gap: spacing.sm } });
