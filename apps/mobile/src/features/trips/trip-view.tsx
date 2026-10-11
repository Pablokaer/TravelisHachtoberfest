// A saved trip as a page: title, map, totals, stops and walking links. Used by the owner's trip
// screen and by the shared link screen (D-031); each adds its own actions below.
import { Stack } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { PageHeader, Screen, Section } from '@/components/screen';
import { Text } from '@/components/text';
import { AttractionRow } from '@/features/destinations/components';
import { MapView } from '@/features/map/map-view';
import { boundsOf } from '@/features/map/map-view.types';
import { useNavigationStore } from '@/features/navigation/navigation-store';
import { OfflineTripSection } from '@/features/offline/offline-trip-section';
import { NavigationPanel } from '@/features/navigation/navigation-panel';
import { useTripNavigation } from '@/features/navigation/use-trip-navigation';
import { NavigationLinks, RouteTotals } from '@/features/route/components';
import type { TripDetail } from '@/features/trips/api';
import { streetGeometryOf } from '@/features/trips/street-geometry';
import { env } from '@/lib/env';
import { formatDate } from '@/lib/format';
import { radius, spacing } from '@/theme/colors';
import { useBreakpoint, useShadows, useTheme } from '@/theme/use-theme';

/** Shown when the trip is the copy saved on the device because the network failed (D-092). */
function OfflineNotice() {
  const { t } = useTranslation();
  return (
    <Text variant="caption" secondary testID="offline-notice" accessibilityLiveRegion="polite">
      {t('offline.notice')}
    </Text>
  );
}

const ORS_ATTRIBUTION = '© openrouteservice.org by HeiGIT | Map data © OpenStreetMap contributors';

type Props = {
  trip: TripDetail;
  units: 'metric' | 'imperial';
  /** Opens a stop's page; without it (signed-out visitors) stops are not pressable. */
  onOpenStop?: (attractionId: string) => void;
  /** Shown above the details, e.g. "This is your list". */
  notice?: ReactNode;
  /** Actions after the walking links (visibility, share, delete…). */
  children?: ReactNode;
};

function TripMap({ trip, onOpenStop }: Pick<Props, 'trip' | 'onOpenStop'>) {
  const { t } = useTranslation();
  const theme = useTheme();
  const shadows = useShadows();
  const { isDesktop } = useBreakpoint();
  // While this trip is navigated (D-086): the next stop stands out, reached ones fade, and the
  // traveller's dot is followed.
  const streetPath = streetGeometryOf(trip);
  const navigating = useNavigationStore((s) => s.tripId === trip.id && s.status !== 'idle');
  const nextIndex = useNavigationStore((s) => s.index);
  const position = useNavigationStore((s) => (s.tripId === trip.id ? s.position : null));
  const points = useMemo(
    () =>
      trip.stops.map((s, i) => ({
        id: s.id,
        lat: s.lat,
        lng: s.lng,
        color: navigating && i < nextIndex ? theme.textSecondary : theme.primary,
        selected: navigating ? i === nextIndex : true,
        order: i + 1,
      })),
    [trip.stops, theme.primary, theme.textSecondary, navigating, nextIndex],
  );
  return (
    <View style={[styles.map, isDesktop && styles.mapDesktop, { boxShadow: shadows.card }]}>
      <MapView
        testID="trip-map"
        accessibilityLabel={t('route.mapLabel')}
        styleUrl={env.mapStyleUrl}
        bounds={boundsOf(trip.stops, [-180, -85, 180, 85])}
        points={points}
        routes={streetPath ? [{ geometry: streetPath, color: theme.primary }] : []}
        onPointPress={onOpenStop}
        userPosition={position}
        followUser={navigating}
      />
    </View>
  );
}

function TripDetails({ trip, units, onOpenStop, children }: Omit<Props, 'notice'>) {
  const { t } = useTranslation();
  const navigation = useTripNavigation(trip);
  return (
    <View style={styles.column}>
      <NavigationPanel tripId={trip.id} stops={trip.stops} onOpenStop={onOpenStop} />
      <RouteTotals
        distanceM={trip.distanceM}
        walkingSeconds={trip.walkingSeconds}
        visitMinutes={trip.visitMinutes ?? 0}
        units={units}
        isFallback={trip.isFallback}
        attribution={trip.provider === 'openrouteservice' ? ORS_ATTRIBUTION : null}
      />
      <Section title={t('route.stopsTitle')}>
        {trip.stops.map((s, i) => (
          <AttractionRow
            key={s.id}
            item={s}
            index={i}
            onPress={onOpenStop ? () => onOpenStop(s.id) : undefined}
          />
        ))}
      </Section>
      <OfflineTripSection trip={trip} />
      <NavigationLinks stops={trip.stops} navigation={navigation} />
      {children}
    </View>
  );
}

/**
 * @example <TripView trip={trip} units="metric" onOpenStop={openAttraction}>{actions}</TripView>
 */
export function TripView({ trip, units, onOpenStop, notice, children }: Props) {
  const { i18n } = useTranslation();
  const { isDesktop } = useBreakpoint();
  const lang = i18n.resolvedLanguage ?? 'en';
  const map = <TripMap trip={trip} onOpenStop={onOpenStop} />;
  const details = (
    <TripDetails trip={trip} units={units} onOpenStop={onOpenStop}>
      {children}
    </TripDetails>
  );
  return (
    <Screen edges={['left', 'right']} width={isDesktop ? 'wide' : 'content'}>
      <Stack.Screen options={{ title: trip.name }} />
      <PageHeader
        size="title"
        title={trip.name}
        subtitle={trip.tripDate ? formatDate(trip.tripDate, lang, { dateStyle: 'full' }) : null}
      />
      {trip.fromOffline ? <OfflineNotice /> : null}
      {notice}
      {isDesktop ? (
        <View style={styles.split}>
          <View style={styles.column}>{map}</View>
          {details}
        </View>
      ) : (
        <>
          {map}
          {details}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  map: { height: 300, borderRadius: radius.xl, overflow: 'hidden' },
  mapDesktop: { height: 560 },
  split: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xl },
  column: { flex: 1, gap: spacing.lg },
});
