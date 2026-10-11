// "Offline" on a trip's page (D-092): save the trip on this device, see what the copy holds, update
// or remove it. The copy opens (and navigation runs) with no connection.
import type { TFunction } from 'i18next';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Section } from '@/components/screen';
import { Text } from '@/components/text';
import type { TripDetail } from '@/features/trips/api';
import { formatDate } from '@/lib/format';
import { spacing } from '@/theme/colors';
import { useTripOffline, type SaveProgress } from './use-offline';

function progressText(progress: SaveProgress, t: TFunction): string {
  if (progress.stage === 'map' && progress.percent !== null) {
    return t('offline.savingMapPercent', { percent: Math.round(progress.percent) });
  }
  return t(`offline.stage.${progress.stage}` as const);
}

/**
 * @example <OfflineTripSection trip={trip} />
 */
export function OfflineTripSection({ trip }: { trip: TripDetail }) {
  const { t, i18n } = useTranslation();
  const { copy, progress, save, remove } = useTripOffline(trip);
  const lang = i18n.resolvedLanguage ?? 'en';
  const saving = save.isPending;
  const error = save.error ?? remove.error;
  return (
    <Section title={t('offline.title')}>
      <Card style={styles.card} testID="offline-section">
        {copy ? (
          <View style={styles.status} testID="offline-saved">
            <Text variant="subtitle">
              {t('offline.savedOn', {
                date: formatDate(copy.savedAt, lang, { dateStyle: 'medium' }),
              })}
            </Text>
            <Text variant="caption" secondary>
              {copy.mapPackId ? t('offline.withMap') : t('offline.withoutMap')}
            </Text>
          </View>
        ) : (
          <Text secondary>{t('offline.hint')}</Text>
        )}
        {saving && progress ? (
          <Text variant="caption" secondary testID="offline-progress">
            {progressText(progress, t)}
          </Text>
        ) : null}
        {save.data && !saving ? (
          <Text variant="caption" secondary>
            {save.data.photosSaved ? t('offline.photosOk') : t('offline.photosFailed')}
          </Text>
        ) : null}
        {error ? (
          <Text variant="caption" style={styles.error} testID="offline-error">
            {t('offline.failed', { message: error.message })}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <Button
            testID="offline-save"
            icon={copy ? 'bookmarked' : 'bookmark'}
            variant={copy ? 'secondary' : 'primary'}
            label={copy ? t('offline.update') : t('offline.save')}
            loading={saving}
            // A copy shown because the network failed cannot be refreshed until it is back.
            disabled={trip.fromOffline}
            onPress={() => save.mutate()}
          />
          {copy ? (
            <Button
              testID="offline-remove"
              variant="ghost"
              label={t('offline.remove')}
              loading={remove.isPending}
              onPress={() => remove.mutate()}
            />
          ) : null}
        </View>
      </Card>
    </Section>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.md, gap: spacing.sm },
  status: { gap: spacing.xxs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  error: { color: '#B3261E' },
});
