import type { LineString } from '@wayfarer/shared';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { palette } from '@/theme/colors';

export type MapPoint = {
  id: string;
  lat: number;
  lng: number;
  color: string;
  /** Selected points are drawn larger with a ring. */
  selected?: boolean;
  /** 1-based position when the point is a route stop. */
  order?: number;
  /** Photo markers: the place's image (null → the photo placeholder) and its name. */
  imageUrl?: string | null;
  name?: string;
};

export type MapInsets = { top?: number; bottom?: number };

/** What a photo marker shows: a point rebuilt with the same values needs no re-render. */
const MARKER_FIELDS = ['id', 'lat', 'lng', 'imageUrl', 'name', 'selected', 'order'] as const;

/**
 * True when two points draw the same photo marker (D-051): the city page rebuilds every point on
 * each selection, so markers compare values, not objects, and only the changed ones re-render.
 * @example samePhotoMarker(point, { ...point }) // true
 */
export function samePhotoMarker(a: MapPoint, b: MapPoint): boolean {
  return MARKER_FIELDS.every((field) => a[field] === b[field]);
}

/** Space between a popup and a covered band or the map edge, in px. */
const POPUP_MARGIN = 12;

/**
 * How far to pan the map vertically so a popup clears the covered bands: positive moves the
 * content up, negative down, 0 when it already fits.
 * @example popupPanY({ top: 500, bottom: 700 }, { top: 0, bottom: 800 }, { bottom: 150 }) // 62
 */
export function popupPanY(
  popup: { top: number; bottom: number },
  map: { top: number; bottom: number },
  insets: MapInsets = {},
): number {
  const below = popup.bottom - (map.bottom - (insets.bottom ?? 0) - POPUP_MARGIN);
  if (below > 0) return below;
  const above = map.top + (insets.top ?? 0) + POPUP_MARGIN - popup.top;
  return above > 0 ? -above : 0;
}

/** One walking route drawn on the map; split routes each get their own colour. */
export type RouteLine = { geometry: LineString; color: string };

export type MapViewProps = {
  styleUrl: string;
  /** Initial / target viewport: [west, south, east, north]. */
  bounds: [number, number, number, number];
  points: MapPoint[];
  routes?: RouteLine[];
  onPointPress?: (id: string) => void;
  /**
   * `circle` (default): coloured dots drawn by the map (route and trip maps). `photo`: each
   * point is a round photo marker (city page, D-029).
   */
  markers?: 'circle' | 'photo';
  /** Photo markers: the selected point, drawn larger and above the others. */
  selectedId?: string | null;
  /** Photo markers: shown over the map, attached to the selected point (e.g. its card). */
  popup?: ReactNode;
  /** A press on the map that hits no marker or popup (e.g. to close the popup). */
  onMapPress?: () => void;
  /**
   * Bands of the map covered by the app's floating UI (px from the top and bottom edges); the
   * map pans an opening popup out of them.
   */
  overlayInsets?: MapInsets;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
};

export function toFeatureCollection(points: MapPoint[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: points.map((p) => ({
      type: 'Feature',
      id: p.id,
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: {
        id: p.id,
        color: p.color,
        selected: p.selected ? 1 : 0,
        label: p.order ? String(p.order) : '',
      },
    })),
  };
}

export function toRouteFeature(routes: RouteLine[] | undefined): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: (routes ?? []).map((r) => ({
      type: 'Feature',
      geometry: r.geometry,
      properties: { color: r.color },
    })),
  };
}

/** Bounds that contain every point, padded; falls back to the given bounds. */
export function boundsOf(
  points: { lat: number; lng: number }[],
  fallback: [number, number, number, number],
): [number, number, number, number] {
  if (points.length === 0) return fallback;
  const lngs = points.map((p) => p.lng);
  const lats = points.map((p) => p.lat);
  const pad = 0.004;
  return [
    Math.min(...lngs) - pad,
    Math.min(...lats) - pad,
    Math.max(...lngs) + pad,
    Math.max(...lats) + pad,
  ];
}

export const circlePaint = {
  'circle-color': ['get', 'color'],
  'circle-radius': ['case', ['==', ['get', 'selected'], 1], 11, 7],
  'circle-stroke-color': '#FFFFFF',
  'circle-stroke-width': ['case', ['==', ['get', 'selected'], 1], 3, 1.5],
} as const;

export const labelLayout = {
  'text-field': ['get', 'label'],
  'text-size': 12,
  'text-font': ['Noto Sans Bold'],
  'text-allow-overlap': true,
} as const;

export const routePaint = {
  'line-color': ['coalesce', ['get', 'color'], palette.light.primary],
  'line-width': 4,
  'line-opacity': 0.85,
} as const;
