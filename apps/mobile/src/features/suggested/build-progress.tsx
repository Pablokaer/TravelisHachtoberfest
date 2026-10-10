// What the traveller sees while the city builder prepares their own city (D-079).
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Card } from '@/components/card';
import { LoadingState } from '@/components/states';
import { Text } from '@/components/text';
import { spacing } from '@/theme/colors';
import type { OwnCity } from './use-own-city';

/**
 * @example <BuildProgress own={own} /> // "Getting your city ready" + the current stage
 */
export function BuildProgress({ own }: { own: OwnCity }) {
  const { t } = useTranslation();
  if (own.phase === 'resolving') return <LoadingState />;
  return (
    <Card testID="city-build-progress">
      <View style={styles.text}>
        <Text variant="heading">{t('suggested.buildingTitle')}</Text>
        <Text secondary>{t('suggested.buildingBody')}</Text>
        {own.stage ? <Text variant="subtitle">{t(`suggested.stage_${own.stage}`)}</Text> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({ text: { gap: spacing.sm } });
