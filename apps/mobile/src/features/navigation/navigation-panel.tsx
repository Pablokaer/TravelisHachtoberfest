// What the traveller sees while navigating a trip in the app (D-086): the next stop and how far it
// is, a warning when they leave the route, the stops still ahead (each opens its page, so they
// can read about a place without ending the navigation) and the buttons to skip or stop.
import { guidanceTo } from '@wayfarer/shared';
import { useKeepAwake } from 'expo-keep-awake';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { Tappable } from '@/components/tappable';
import { Text } from '@/components/text';
import { localizedName, type AttractionSummary } from '@/features/destinations/api';
import { useProfile } from '@/features/profile/api';
import { formatDistance, formatDuration } from '@/lib/format';
import { radius, spacing } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';
import { useNavigationStore } from './navigation-store';

type Props = {
  /** The trip shown on this page: the panel only appears while this trip is being navigated. */
  tripId: string;
  stops: AttractionSummary[];
  /** Opens a stop's page; navigation keeps going underneath. */
  onOpenStop?: (attractionId: string) => void;
};

function StopLink({
  stop,
  lang,
  onOpen,
}: {
  stop: AttractionSummary;
  lang: string;
  onOpen?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const name = localizedName(stop, lang);
  return (
    <Tappable
      onPress={onOpen ? () => onOpen(stop.id) : undefined}
      accessibilityRole="link"
      accessibilityLabel={t('navigation.openStop', { name })}
      style={styles.stopLink}>
      <Text style={styles.flex} numberOfLines={1}>
        {name}
      </Text>
      {onOpen ? <Icon name="chevronRight" size={16} color={theme.textSecondary} /> : null}
    </Tappable>
  );
}

function Distance({ stop }: { stop: AttractionSummary }) {
  const { t, i18n } = useTranslation();
  const position = useNavigationStore((s) => s.position);
  const units = useProfile().data?.units ?? 'metric';
  if (!position) return null;
  const { distanceM, walkingSeconds } = guidanceTo(position, stop);
  return (
    <Text variant="caption" secondary testID="navigation-away">
      {t('navigation.away', {
        distance: formatDistance(distanceM, units, i18n.resolvedLanguage ?? 'en'),
        duration: formatDuration(walkingSeconds),
      })}
    </Text>
  );
}

function Status({ children, tone }: { children: string; tone?: 'warning' }) {
  const theme = useTheme();
  return (
    <View style={styles.status}>
      <Icon name={tone ? 'error' : 'info'} size={16} color={tone ? theme.danger : theme.primary} />
      <Text variant="caption" style={[styles.flex, tone ? { color: theme.danger } : null]}>
        {children}
      </Text>
    </View>
  );
}

/**
 * @example <NavigationPanel tripId={trip.id} stops={trip.stops} onOpenStop={openAttraction} />
 */
export function NavigationPanel({ tripId, stops, onOpenStop }: Props) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const nav = useNavigationStore();
  // The screen stays on while navigating: a phone that sleeps in a pocket loses the walk.
  useKeepAwake();
  if (nav.tripId !== tripId || nav.status === 'idle') return null;
  const lang = i18n.resolvedLanguage ?? 'en';
  const next = stops[nav.index];
  const ahead = stops.slice(nav.index + 1);
  const failed = nav.status === 'denied' || nav.status === 'error';
  return (
    <Card testID="navigation-panel" style={[styles.card, { borderColor: theme.primary }]}>
      <Text variant="heading">{t('navigation.title')}</Text>
      {nav.status === 'locating' ? <Status>{t('navigation.locating')}</Status> : null}
      {nav.status === 'denied' ? <Status tone="warning">{t('navigation.denied')}</Status> : null}
      {nav.status === 'error' ? (
        <Status tone="warning">{t('navigation.error', { message: nav.message ?? '' })}</Status>
      ) : null}
      {nav.status === 'finished' ? <Status>{t('navigation.arrived')}</Status> : null}
      {next && !failed && nav.status !== 'finished' ? (
        <View style={styles.next}>
          <Text variant="label" secondary>
            {t('navigation.stopOf', { number: nav.index + 1, count: stops.length })}
          </Text>
          <StopLink stop={next} lang={lang} onOpen={onOpenStop} />
          <Distance stop={next} />
        </View>
      ) : null}
      {nav.offRoute ? <Status tone="warning">{t('navigation.offRoute')}</Status> : null}
      {ahead.length > 0 && !failed ? (
        <View>
          {ahead.map((stop) => (
            <StopLink key={stop.id} stop={stop} lang={lang} onOpen={onOpenStop} />
          ))}
        </View>
      ) : null}
      {!failed ? (
        <Text variant="helper" secondary>
          {t('navigation.readHint')}
        </Text>
      ) : null}
      <View style={styles.actions}>
        {nav.status === 'tracking' ? (
          <Button compact variant="secondary" label={t('navigation.skip')} onPress={nav.skip} />
        ) : null}
        <Button compact variant="ghost" label={t('navigation.stop')} onPress={nav.stop} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { padding: spacing.md, gap: spacing.sm, borderWidth: 2, borderRadius: radius.lg },
  next: { gap: spacing.xxs },
  stopLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 36 },
  status: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
