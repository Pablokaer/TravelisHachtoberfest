// Ticks the countries the traveller never wants proposed (D-082): the chosen ones as chips to take
// out, and a search box that finds the others by name, ignoring case and accents.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Chip } from '@/components/chip';
import { SearchField } from '@/components/search-field';
import { Text } from '@/components/text';
import { spacing } from '@/theme/colors';
import type { CountryOption } from './questions';

/** Countries listed while typing; typing narrows the rest. */
const MAX_MATCHES = 8;

type Props = {
  countries: readonly CountryOption[];
  /** The chosen countries, as ISO codes. */
  selected: readonly string[];
  onChange: (codes: string[]) => void;
};

const plain = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * @example <CountryPicker countries={countries} selected={['MT']} onChange={setCodes} />
 */
export function CountryPicker({ countries, selected, onChange }: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const chosen = selected.flatMap((code) => countries.find((c) => c.code === code) ?? []);
  const typed = plain(query.trim());
  const matches = typed
    ? countries
        .filter((c) => !selected.includes(c.code) && plain(c.name).includes(typed))
        .slice(0, MAX_MATCHES)
    : [];
  return (
    <View style={styles.box}>
      {chosen.length === 0 ? <Text secondary>{t('plan.avoidedNone')}</Text> : null}
      <View style={styles.chips}>
        {chosen.map((c) => (
          <Chip
            key={c.code}
            label={c.name}
            selected
            onRemove={() => onChange(selected.filter((code) => code !== c.code))}
          />
        ))}
      </View>
      <SearchField value={query} onChangeText={setQuery} label={t('plan.countriesSearch')} />
      {typed && matches.length === 0 ? (
        <Text secondary>{t('suggested.noPlaces', { query: query.trim() })}</Text>
      ) : null}
      <View style={styles.chips}>
        {matches.map((c) => (
          <Chip
            key={c.code}
            label={c.name}
            onPress={() => {
              onChange([...selected, c.code]);
              setQuery('');
            }}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
