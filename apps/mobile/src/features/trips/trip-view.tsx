// A saved trip as a page: title, map, totals, stops and walking links. Used by the owner's trip
// screen and by the shared link screen (D-031); each adds its own actions below.
import { Stack } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { PageHeader, Screen, Section } from '@/components/screen';
import { AttractionRow } from '@/features/destinations/components';
import { MapView } from '@/features/map/map-view';
import { boundsOf } from '@/features/map/map-view.types';
import { NavigationLinks, RouteTotals } from '@/features/route/components';
import type { TripDetail } from '@/features/trips/api';
import { env } from '@/lib/env';
import { formatDate } from '@/lib/format';
import { radius, spacing } from '@/theme/colors';
import { useBreakpoint, useShadows, useTheme } from '@/theme/use-theme';

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
  const points = useMemo(
    () =>
      trip.stops.map((s, i) => ({
        id: s.id,
        lat: s.lat,
        lng: s.lng,
        color: theme.primary,
        selected: true,
        order: i + 1,
      })),
    [trip.stops, theme.primary],
  );
  return (
    <View style={[styles.map, isDesktop && styles.mapDesktop, { boxShadow: shadows.card }]}>
      <MapView
        testID="trip-map"
        accessibilityLabel={t('route.mapLabel')}
        styleUrl={env.mapStyleUrl}
        bounds={boundsOf(trip.stops, [-180, -85, 180, 85])}
        points={points}
        routes={trip.geometry ? [{ geometry: trip.geometry, color: theme.primary }] : []}
        onPointPress={onOpenStop}
      />
    </View>
  );
}

function TripDetails({ trip, units, onOpenStop, children }: Omit<Props, 'notice'>) {
  const { t } = useTranslation();
  return (
    <View style={styles.column}>
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
      <NavigationLinks stops={trip.stops} />
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
