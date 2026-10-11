// First question of the planner (D-081): where the trip starts from. The location of the device,
// a city the app has, or any city of the world found by name: the distance limit is measured from it.
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { cityName, type City } from '@/features/destinations/api';
import { CityChooser } from '@/features/suggested/city-chooser';
import {
  ExpoLocationSource,
  findUserPosition,
  type LocationSource,
} from '@/features/suggested/location';
import { spacing } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';
import { originFromPosition } from './origin-from-position';
import type { Origin } from './use-plan-wizard';

type Props = {
  origin: Origin | null;
  cities: City[];
  onOrigin: (origin: Origin) => void;
  /** The device's location service; a fake one in tests. */
  source?: LocationSource;
};

const defaultSource = new ExpoLocationSource();

/** What the "Use my location" button last did, so the traveller always sees an answer. */
type Locating =
  | { phase: 'idle' }
  | { phase: 'looking' }
  | { phase: 'found'; label: string }
  | { phase: 'denied' }
  | { phase: 'error'; message: string };

function Feedback({ state }: { state: Locating }) {
  const { t } = useTranslation();
  const theme = useTheme();
  if (state.phase === 'idle' || state.phase === 'found') return null;
  const text =
    state.phase === 'looking'
      ? t('plan.originLocating')
      : state.phase === 'denied'
        ? t('plan.originDenied')
        : t('plan.originError', { message: state.message });
  const failed = state.phase !== 'looking';
  return (
    <View style={styles.feedback} accessibilityLiveRegion="polite" testID="origin-feedback">
      <Icon
        name={failed ? 'error' : 'pin'}
        size={16}
        color={failed ? theme.danger : theme.primary}
      />
      <Text variant="caption" style={[styles.flex, failed ? { color: theme.danger } : null]}>
        {text}
      </Text>
    </View>
  );
}

/**
 * @example <OriginPicker origin={origin} cities={cities} onOrigin={wizard.setOrigin} />
 */
export function OriginPicker({ origin, cities, onOrigin, source = defaultSource }: Props) {
  const { t, i18n } = useTranslation();
  const [locating, setLocating] = useState<Locating>({ phase: 'idle' });
  const language = i18n.resolvedLanguage ?? 'en';
  const useMyLocation = async () => {
    setLocating({ phase: 'looking' });
    const result = await findUserPosition(source, true);
    if (result.status === 'denied') return setLocating({ phase: 'denied' });
    if (result.status === 'error') return setLocating({ phase: 'error', message: result.message });
    const labels = {
      mine: t('plan.myLocation'),
      near: (city: string) => t('plan.originNear', { city }),
    };
    const found = originFromPosition(result.position, cities, language, labels);
    setLocating({ phase: 'found', label: found.label });
    onOrigin(found);
  };
  // The parent's origin wins (a city picked later replaces the located one); the located label
  // shows at once, before the parent has re-rendered with it.
  const startingFrom = origin?.label ?? (locating.phase === 'found' ? locating.label : null);
  return (
    <View style={styles.box}>
      {startingFrom ? (
        <Text variant="subtitle" testID="origin-found">
          {t('plan.originFound', { place: startingFrom })}
        </Text>
      ) : null}
      <Button
        icon="pin"
        label={t('plan.originHere')}
        loading={locating.phase === 'looking'}
        onPress={useMyLocation}
      />
      <Feedback state={locating} />
      <Text secondary>{t('plan.originSearch')}</Text>
      <CityChooser
        cities={cities}
        onChoose={(slug) => {
          const city = cities.find((c) => c.slug === slug);
          if (city) onOrigin({ lat: city.lat, lng: city.lng, label: cityName(city, language) });
        }}
        onChoosePlace={(place) => onOrigin({ lat: place.lat, lng: place.lng, label: place.name })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.sm },
  flex: { flex: 1 },
  feedback: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
});
