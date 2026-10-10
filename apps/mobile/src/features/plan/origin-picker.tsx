// First question of the planner (D-081): where the trip starts from. The location of the device,
// a city the app has, or any city of the world found by name: the distance limit is measured from it.
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';

import { Button } from '@/components/button';
import { Text } from '@/components/text';
import { cityName, type City } from '@/features/destinations/api';
import { CityChooser } from '@/features/suggested/city-chooser';
import { ExpoLocationSource, findUserPosition } from '@/features/suggested/location';
import { spacing } from '@/theme/colors';
import type { Origin } from './use-plan-wizard';

type Props = { origin: Origin | null; cities: City[]; onOrigin: (origin: Origin) => void };

const source = new ExpoLocationSource();

/**
 * @example <OriginPicker origin={origin} cities={cities} onOrigin={wizard.setOrigin} />
 */
export function OriginPicker({ origin, cities, onOrigin }: Props) {
  const { t, i18n } = useTranslation();
  const [locating, setLocating] = useState(false);
  const useMyLocation = async () => {
    setLocating(true);
    const result = await findUserPosition(source, true);
    setLocating(false);
    if (result.status === 'found') onOrigin({ ...result.position, label: t('plan.myLocation') });
  };
  return (
    <View style={styles.box}>
      {origin ? (
        <Text variant="subtitle">{t('plan.originFound', { place: origin.label })}</Text>
      ) : null}
      <Button icon="pin" label={t('plan.originHere')} loading={locating} onPress={useMyLocation} />
      <Text secondary>{t('plan.originSearch')}</Text>
      <CityChooser
        cities={cities}
        onChoose={(slug) => {
          const city = cities.find((c) => c.slug === slug);
          if (city)
            onOrigin({
              lat: city.lat,
              lng: city.lng,
              label: cityName(city, i18n.resolvedLanguage ?? 'en'),
            });
        }}
        onChoosePlace={(place) => onOrigin({ lat: place.lat, lng: place.lng, label: place.name })}
      />
    </View>
  );
}

const styles = StyleSheet.create({ box: { gap: spacing.sm } });
