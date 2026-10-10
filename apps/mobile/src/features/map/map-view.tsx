// Web implementation (maplibre-gl). Native lives in map-view.native.tsx.
import './map-view.css';

import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import {
  circlePaint,
  labelLayout,
  routePaint,
  toFeatureCollection,
  toRouteFeature,
  type MapViewProps,
} from './map-view.types';
import { loadStylesheet } from './stylesheet';
import { WebPhotoMarker, WebPopup } from './web-annotations';

type Loaded = { lib: typeof import('maplibre-gl'); map: MapLibreMap };

/** Copied into public/ by scripts/copy-maplibre-worker.mjs, with the worker. */
const MAPLIBRE_CSS_URL = '/maplibre/maplibre-gl.css';

/**
 * maplibre-gl and its stylesheet, loaded when the first map is created: imported statically,
 * its 83 kB of CSS was a render-blocking <link> on every exported page (D-062). Waiting for the
 * sheet keeps the controls and popups from showing unstyled.
 * @example const maplibregl = await loadMapLibre();
 */
async function loadMapLibre(): Promise<typeof import('maplibre-gl')> {
  const [lib] = await Promise.all([import('maplibre-gl'), loadStylesheet(MAPLIBRE_CSS_URL)]);
  return lib;
}

/** Press on the map itself, not on a marker, the popup or a circle point. */
function isEmptySpot(m: MapLibreMap, e: { point: { x: number; y: number }; originalEvent: Event }) {
  const target = e.originalEvent.target as HTMLElement | null;
  if (target?.closest?.('.maplibregl-marker, .maplibregl-popup')) return false;
  return (
    m.queryRenderedFeatures([e.point.x, e.point.y], { layers: ['points-circle'] }).length === 0
  );
}

export function MapView({
  styleUrl,
  bounds,
  points,
  routes,
  onPointPress,
  markers = 'circle',
  selectedId,
  popup,
  onMapPress,
  overlayInsets,
  style,
  testID,
  accessibilityLabel,
}: MapViewProps) {
  const container = useRef<View>(null);
  const map = useRef<MapLibreMap | null>(null);
  const loaded = useRef(false);
  // Photo markers are map annotations, so the dot layer stays empty.
  const dots = useMemo(() => (markers === 'photo' ? [] : points), [markers, points]);
  const latest = useRef({ dots, routes, onPointPress, onMapPress });
  useEffect(() => {
    latest.current = { dots, routes, onPointPress, onMapPress };
  }, [dots, routes, onPointPress, onMapPress]);
  // Set once the style has loaded; the photo markers and the popup render from then on.
  const [ready, setReady] = useState<Loaded | null>(null);

  // Create the map once (client-side only; never during static rendering).
  useEffect(() => {
    let cancelled = false;
    let instance: MapLibreMap | null = null;
    void loadMapLibre().then((maplibregl) => {
      const el = container.current as unknown as HTMLElement | null;
      if (cancelled || !el) return;
      // Served from public/ (see scripts/copy-maplibre-worker.mjs).
      maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
      const created = new maplibregl.Map({
        container: el,
        style: styleUrl,
        bounds,
        fitBoundsOptions: { padding: 40 },
        attributionControl: { compact: true },
      });
      instance = created;
      created.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      created.on('load', () => {
        const m = created;
        m.addSource('route', { type: 'geojson', data: toRouteFeature(latest.current.routes) });
        m.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'route',
          paint: routePaint as never,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        });
        m.addSource('points', {
          type: 'geojson',
          data: toFeatureCollection(latest.current.dots),
        });
        m.addLayer({
          id: 'points-circle',
          type: 'circle',
          source: 'points',
          paint: circlePaint as never,
        });
        m.addLayer({
          id: 'points-label',
          type: 'symbol',
          source: 'points',
          layout: labelLayout as never,
          paint: { 'text-color': '#FFFFFF' },
        });
        m.on('click', 'points-circle', (e) => {
          const id = e.features?.[0]?.properties?.id;
          if (typeof id === 'string') latest.current.onPointPress?.(id);
        });
        m.on('mouseenter', 'points-circle', () => (m.getCanvas().style.cursor = 'pointer'));
        m.on('mouseleave', 'points-circle', () => (m.getCanvas().style.cursor = ''));
        m.on('click', (e) => {
          if (isEmptySpot(m, e)) latest.current.onMapPress?.();
        });
        loaded.current = true;
        setReady({ lib: maplibregl, map: m });
      });
      map.current = created;
    });
    return () => {
      cancelled = true;
      loaded.current = false;
      setReady(null);
      instance?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the map is created once per style
  }, [styleUrl]);

  useEffect(() => {
    if (!loaded.current) return;
    (map.current?.getSource('points') as GeoJSONSource | undefined)?.setData(
      toFeatureCollection(dots),
    );
  }, [dots]);

  useEffect(() => {
    if (!loaded.current) return;
    (map.current?.getSource('route') as GeoJSONSource | undefined)?.setData(toRouteFeature(routes));
  }, [routes]);

  const boundsKey = bounds.join(',');
  useEffect(() => {
    map.current?.fitBounds(bounds, { padding: 40, duration: 600 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- compare by value
  }, [boundsKey]);

  // Stable, so the memoised markers do not all re-render with each new selection.
  const pressPoint = useCallback((id: string) => latest.current.onPointPress?.(id), []);
  const selected = markers === 'photo' ? points.find((p) => p.id === selectedId) : undefined;
  return (
    <View
      ref={container}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      style={[{ flex: 1, minHeight: 240, overflow: 'hidden' }, style]}>
      {ready && markers === 'photo'
        ? points.map((p) => (
            <WebPhotoMarker
              key={p.id}
              lib={ready.lib}
              map={ready.map}
              point={p}
              onPress={pressPoint}
            />
          ))
        : null}
      {ready && selected && popup ? (
        <WebPopup
          lib={ready.lib}
          map={ready.map}
          lngLat={[selected.lng, selected.lat]}
          insets={overlayInsets}>
          {popup}
        </WebPopup>
      ) : null}
    </View>
  );
}
