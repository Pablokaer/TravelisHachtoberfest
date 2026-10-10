import { zodResolver } from '@hookform/resolvers/zod';
import {
  ROUTE_MAX_STOPS,
  ROUTE_MIN_STOPS,
  ROUTE_SPLIT_MIN_STOPS,
  saveTripFormSchema,
  type RouteResponse,
  type SaveTripForm,
  meetupStart,
} from '@wayfarer/shared';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { PageHeader, Screen, Section } from '@/components/screen';
import { EmptyState } from '@/components/states';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { FormError } from '@/features/auth/components';
import { useCities } from '@/features/destinations/api';
import { MapView } from '@/features/map/map-view';
import { boundsOf, type MapPoint, type RouteLine } from '@/features/map/map-view.types';
import { useProfile } from '@/features/profile/api';
import { routesToOptimize, useOptimizeRoutes } from '@/features/route/api';
import { RouteTotals } from '@/features/route/components';
import { useRouteColor } from '@/features/route/route-colors';
import { RouteOrderNotice, RouteStopList, SplitPanel } from '@/features/route/route-plan';
import { useRouteStore } from '@/features/route/store';
import type { AttractionSummary } from '@/features/destinations/api';
import { useSaveTrips } from '@/features/trips/api';
import { FALLBACK_TIME_ZONE } from '@/features/trips/meetup-time';
import { env } from '@/lib/env';
import { radius, spacing } from '@/theme/colors';
import { useBreakpoint, useShadows } from '@/theme/use-theme';

/** Identifies a route by its stops in order, so a result only applies to the exact route. */
const routeKey = (route: readonly AttractionSummary[]) => route.map((s) => s.id).join(',');

/** Numbered map points, coloured per route. */
function routePoints(
  routes: AttractionSummary[][],
  colorOf: (index: number) => string,
): MapPoint[] {
  return routes.flatMap((route, r) =>
    route.map((s, i) => ({
      id: s.id,
      lat: s.lat,
      lng: s.lng,
      color: colorOf(r),
      selected: true,
      order: i + 1,
    })),
  );
}

export default function RouteScreen() {
  const { t, i18n } = useTranslation();
  const store = useRouteStore();
  const { stops, routes, citySlug, manualOrder } = store;
  const cities = useCities();
  const profile = useProfile();
  const city = cities.data?.find((c) => c.slug === citySlug);
  const optimize = useOptimizeRoutes();
  const save = useSaveTrips();
  const [results, setResults] = useState<Record<string, RouteResponse>>({});
  // The page stops scrolling while a stop is dragged, so the gesture moves the stop.
  const [dragging, setDragging] = useState(false);
  const shadows = useShadows();
  const { isDesktop } = useBreakpoint();
  const units = profile.data?.units ?? 'metric';

  const cityName = city ? (i18n.resolvedLanguage === 'pt' ? city.namePt : city.nameEn) : '';
  const { control, handleSubmit, setError } = useForm<SaveTripForm>({
    resolver: zodResolver(saveTripFormSchema),
    defaultValues: {
      name: t('route.defaultName', { city: cityName }),
      tripDate: null,
      startTime: null,
    },
  });

  const colorOf = useRouteColor();
  const points = useMemo(() => routePoints(routes, colorOf), [routes, colorOf]);
  const routeResults = routes.map((route) => results[routeKey(route)] ?? null);
  const lines = useMemo(
    () =>
      routes.flatMap((route, r): RouteLine[] => {
        const geometry = results[routeKey(route)]?.geometry;
        return geometry ? [{ geometry, color: colorOf(r) }] : [];
      }),
    [routes, results, colorOf],
  );

  if (stops.length === 0) {
    return (
      <EmptyState
        icon="route"
        title={t('route.emptyTitle')}
        body={t('route.emptyBody')}
        action={<Button icon="map" label={t('route.backToMap')} onPress={() => router.back()} />}
      />
    );
  }

  const optimized = routeResults.every((r) => r != null);
  const tooShort = routes.some((r) => r.length < ROUTE_MIN_STOPS);
  const runOptimize = () => {
    const targets = routesToOptimize(routeResults);
    optimize.mutate(
      // An order set by hand is kept; the server only walks it along the streets (D-046).
      { routes: targets.map((i) => routes[i]!), keepOrder: manualOrder },
      {
        onSuccess: (responses) => {
          // Untouched routes keep their answer; optimised ones take the server's order.
          const next: Record<string, RouteResponse> = {};
          routes.forEach((route, i) => {
            if (routeResults[i] && !targets.includes(i)) next[routeKey(route)] = routeResults[i]!;
          });
          responses.forEach((r, k) => {
            store.setRouteOrder(targets[k]!, r.order);
            next[r.order.join(',')] = r;
          });
          setResults(next);
        },
      },
    );
  };

  const onSave = handleSubmit((form) => {
    // The time is the city's wall-clock time (D-041); it must still be to come.
    const start = meetupStart(form, city?.timezone ?? FALLBACK_TIME_ZONE, new Date());
    if ('error' in start) return setError('startTime', { message: start.error });
    save.mutate(
      routes.map((route, i) => ({
        name: routes.length > 1 ? t('route.splitName', { name: form.name, n: i + 1 }) : form.name,
        tripDate: form.tripDate,
        startsAt: start.startsAt,
        citySlug: citySlug!,
        stops: route,
        route: routeResults[i] ?? null,
      })),
      {
        onSuccess: (ids) => {
          store.clear();
          if (ids.length === 1) router.replace({ pathname: '/trip/[id]', params: { id: ids[0]! } });
          else router.replace('/trips');
        },
      },
    );
  });

  const fallbackBounds: [number, number, number, number] = city
    ? [city.bbox[1], city.bbox[0], city.bbox[3], city.bbox[2]]
    : [-180, -85, 180, 85];

  const map = (
    <View style={[styles.map, isDesktop && styles.mapDesktop, { boxShadow: shadows.card }]}>
      <MapView
        testID="route-map"
        accessibilityLabel={t('route.mapLabel')}
        styleUrl={env.mapStyleUrl}
        bounds={boundsOf(stops, fallbackBounds)}
        points={points}
        routes={lines}
      />
    </View>
  );

  const details = (
    <View style={styles.column}>
      <Section title={t('route.stopsTitle')}>
        <RouteOrderNotice manual={manualOrder} onAuto={store.autoOrder} />
        {routes.map((route, r) => (
          // Keyed by position: a key built from the stop order would rebuild the whole list (and
          // its drag measurements) on every reorder.
          <View key={r} style={styles.route}>
            <RouteStopList
              route={route}
              routeIndex={r}
              routeCount={routes.length}
              splittable={stops.length >= ROUTE_SPLIT_MIN_STOPS}
              units={units}
              // Street legs only for a real route (not the straight-line estimate).
              legs={routeResults[r]?.isFallback ? null : routeResults[r]?.legs}
              onMove={store.move}
              onMoveTo={store.moveTo}
              onDragActive={setDragging}
              onRemove={store.remove}
              onSplitAt={(position) => store.splitAt(r, position)}
            />
            <RouteTotals
              distanceM={routeResults[r]?.distanceM ?? null}
              walkingSeconds={routeResults[r]?.walkingSeconds ?? null}
              visitMinutes={route.reduce((sum, s) => sum + s.avgVisitMinutes, 0)}
              units={units}
              isFallback={routeResults[r]?.isFallback}
              attribution={routeResults[r]?.attribution}
            />
          </View>
        ))}
      </Section>

      <SplitPanel
        stopCount={stops.length}
        routeCount={routes.length}
        onSuggest={store.suggestSplit}
        onMerge={store.merge}
      />

      <View style={styles.optimize}>
        <Button
          icon="sparkles"
          variant={optimized ? 'secondary' : 'primary'}
          label={
            optimized
              ? t('route.reoptimize')
              : routes.length > 1
                ? t('route.optimizeMany', { count: routes.length })
                : t('route.optimize')
          }
          onPress={runOptimize}
          loading={optimize.isPending}
          disabled={tooShort}
          testID="optimize"
        />
        {tooShort ? (
          <Text variant="helper" secondary>
            {t('route.needMore', { min: ROUTE_MIN_STOPS })}
          </Text>
        ) : null}
        <FormError message={optimize.error ? t('route.optimizeError') : null} />
      </View>

      <Card>
        <Text variant="heading">{t('route.saveTitle')}</Text>
        <Controller
          control={control}
          name="name"
          render={({ field, fieldState }) => (
            <TextField
              label={t('route.tripName')}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              maxLength={80}
              testID="trip-name"
            />
          )}
        />
        <Controller
          control={control}
          name="tripDate"
          render={({ field, fieldState }) => (
            <TextField
              icon="calendar"
              label={t('route.tripDate')}
              placeholder={`YYYY-MM-DD · ${t('checklist.optional')}`}
              value={field.value ?? ''}
              onChangeText={(v) => field.onChange(v.trim() === '' ? null : v.trim())}
              error={fieldState.error?.message}
              maxLength={10}
              testID="trip-date"
            />
          )}
        />
        <Controller
          control={control}
          name="startTime"
          render={({ field, fieldState }) => (
            <TextField
              icon="clock"
              label={t('route.startTime')}
              placeholder={`HH:MM · ${t('checklist.optional')}`}
              hint={t('route.startTimeHint')}
              value={field.value ?? ''}
              onChangeText={(v) => field.onChange(v.trim() === '' ? null : v.trim())}
              error={fieldState.error?.message}
              maxLength={5}
              testID="trip-time"
            />
          )}
        />
        {routes.length > 1 ? (
          <Text variant="helper" secondary>
            {t('route.saveSplitHint')}
          </Text>
        ) : null}
        <FormError message={save.error ? save.error.message : null} />
        <Button
          variant={optimized ? 'primary' : 'secondary'}
          label={
            routes.length > 1 ? t('route.saveMany', { count: routes.length }) : t('route.save')
          }
          onPress={onSave}
          loading={save.isPending}
          disabled={tooShort || optimize.isPending}
          testID="save-trip"
        />
        <Button
          variant="ghost"
          icon="trash"
          label={t('route.clear')}
          onPress={() => {
            store.clear();
            router.back();
          }}
        />
      </Card>
    </View>
  );

  return (
    <Screen
      edges={['left', 'right']}
      width={isDesktop ? 'wide' : 'content'}
      scrollEnabled={!dragging}>
      <PageHeader
        size="title"
        title={t('route.titleFor', { city: cityName })}
        subtitle={t('route.stopsHint', { min: ROUTE_MIN_STOPS, max: ROUTE_MAX_STOPS })}
      />
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
  map: { height: 280, borderRadius: radius.xl, overflow: 'hidden' },
  mapDesktop: { height: 560 },
  split: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xl },
  column: { flex: 1, gap: spacing.lg },
  route: { gap: spacing.md },
  optimize: { gap: spacing.sm },
});
