// Drop-down of the cities the traveller has been in or searched for (D-080): one tap makes a
// saved city their location again, without typing it.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { ListRow, RowGroup } from '@/components/list-row';
import { cityName, countryOf, type City } from '@/features/destinations/api';
import { spacing } from '@/theme/colors';

type Props = {
  /** The saved cities, newest first. */
  cities: City[];
  /** The city on the screen, marked as selected. */
  currentSlug: string | null;
  onPick: (city: City) => void;
};

/**
 * @example <SavedCities cities={saved} currentSlug="sintra" onPick={(c) => setTypedPlace(c)} />
 */
export function SavedCities({ cities, currentSlug, onPick }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  const [open, setOpen] = useState(false);
  if (cities.length === 0) return null;
  return (
    <View style={styles.box}>
      <Button
        variant="secondary"
        icon="chevronDown"
        label={t('suggested.savedCities', { count: cities.length })}
        accessibilityHint={t('suggested.savedHint')}
        onPress={() => setOpen((value) => !value)}
      />
      {open ? (
        <RowGroup>
          {cities.map((city) => (
            <ListRow
              key={city.slug}
              role="radio"
              selected={city.slug === currentSlug}
              label={cityName(city, lang)}
              value={countryOf(city, lang)}
              onPress={() => {
                onPick(city);
                setOpen(false);
              }}
            />
          ))}
        </RowGroup>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ box: { gap: spacing.sm } });
