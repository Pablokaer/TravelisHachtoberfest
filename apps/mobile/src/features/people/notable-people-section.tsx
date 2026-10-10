// The city page's "Famous people" card (D-071): historical figures, writers, musicians and
// artists born or died in the city, filtered by category, in a horizontal row of cards.
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  categoriesPresent,
  peopleInCategory,
  useNotablePeople,
  type NotablePerson,
  type PeopleFilter,
} from './api';
import { PersonCard } from './person-card';

import { Chip } from '@/components/chip';
import { centring, useCentredOnPhone } from '@/components/phone-centring';
import { Section } from '@/components/screen';
import { Text } from '@/components/text';
import { cityName, type City } from '@/features/destinations/api';
import { spacing } from '@/theme/colors';

function CategoryChips({
  people,
  filter,
  onChange,
}: {
  people: NotablePerson[];
  filter: PeopleFilter;
  onChange: (filter: PeopleFilter) => void;
}) {
  const { t } = useTranslation();
  const filters: PeopleFilter[] = ['all', ...categoriesPresent(people)];
  const centred = useCentredOnPhone();
  return (
    <View testID="people-filters" style={[styles.chips, centred && centring.row]}>
      {filters.map((f) => (
        <Chip
          key={f}
          label={t(`people.filter.${f}`)}
          selected={filter === f}
          onPress={() => onChange(f)}
        />
      ))}
    </View>
  );
}

/**
 * Nothing while loading, on error or when the city has nobody listed: the page reads fine
 * without it.
 * @example <NotablePeopleSection city={lisbon} />
 */
export function NotablePeopleSection({ city }: { city: City }) {
  const { t, i18n } = useTranslation();
  const people = useNotablePeople(city.slug);
  const [filter, setFilter] = useState<PeopleFilter>('all');
  const centred = useCentredOnPhone();
  if (!people.data?.length) return null;
  const shown = peopleInCategory(people.data, filter);
  return (
    <Section title={t('people.title', { city: cityName(city, i18n.resolvedLanguage ?? 'en') })}>
      <CategoryChips people={people.data} filter={filter} onChange={setFilter} />
      {/* A mouse cannot swipe: on the web the scrollbar shows there is more to the right. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={Platform.OS === 'web'}
        contentContainerStyle={styles.row}>
        {shown.map((p) => (
          <PersonCard key={p.wikidataId} person={p} />
        ))}
      </ScrollView>
      <Text variant="helper" secondary style={centred && centring.text}>
        {t('people.credit')}
      </Text>
    </Section>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  row: { gap: spacing.md - 4, paddingBottom: spacing.xs },
});
