// Photo markers and the selected place's popup on the web map (D-029): React content rendered
// through portals into maplibre-gl's native Marker and Popup, which place them on the map,
// move them with it and keep the popup inside the viewport (automatic anchor).
import type { Map as MapLibreMap } from 'maplibre-gl';
import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { MARKER_SELECTED_SIZE, PhotoMarker } from './photo-marker';
import {
  FOLLOW_ZOOM,
  popupPanY,
  samePhotoMarker,
  USER_DOT_COLOR,
  USER_DOT_SIZE,
  type MapInsets,
  type MapPoint,
} from './map-view.types';

type MapLibre = typeof import('maplibre-gl');

/**
 * The traveller's blue dot (D-086), placed by maplibre-gl's own Marker; with `follow` the map
 * eases to each new position.
 */
export function WebUserDot({
  lib,
  map,
  position,
  follow,
}: {
  lib: MapLibre;
  map: MapLibreMap;
  position: { lat: number; lng: number };
  follow: boolean;
}) {
  const [dot] = useState(() => {
    const el = document.createElement('div');
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', 'You');
    el.style.cssText =
      `width:${USER_DOT_SIZE}px;height:${USER_DOT_SIZE}px;border-radius:50%;` +
      `background:${USER_DOT_COLOR};border:3px solid #fff;box-shadow:0 0 0 2px ${USER_DOT_COLOR}55;`;
    return el;
  });
  const [marker] = useState(() => new lib.Marker({ element: dot }));
  useEffect(() => {
    marker.setLngLat([position.lng, position.lat]).addTo(map);
    if (follow) {
      map.easeTo({
        center: [position.lng, position.lat],
        zoom: Math.max(map.getZoom(), FOLLOW_ZOOM),
        duration: 500,
      });
    }
  }, [marker, map, position.lat, position.lng, follow]);
  useEffect(() => () => void marker.remove(), [marker]);
  return null;
}

/** Stacking order: the selected place above route stops, route stops above the rest. */
function markerZIndex(point: MapPoint): string {
  if (point.selected) return '3';
  return point.order != null ? '2' : '1';
}

type MarkerState = { label: string; pressed: boolean; zIndex: string };

/** A button-like element for one marker: named, focusable, pressable with Enter or Space. */
function useMarkerElement(onPress: () => void, { label, pressed, zIndex }: MarkerState) {
  const [el] = useState(() => {
    const div = document.createElement('div');
    div.className = 'wayfarer-marker';
    div.setAttribute('role', 'button');
    div.tabIndex = 0;
    return div;
  });
  const press = useRef(onPress);
  useEffect(() => {
    press.current = onPress;
  });
  useEffect(() => {
    el.setAttribute('aria-label', label);
    el.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    el.style.setProperty('z-index', zIndex);
  }, [el, label, pressed, zIndex]);
  useEffect(() => {
    // Handled here and not passed on: a marker press must not reach the map (which would
    // treat it as a press on an empty spot and close the card).
    const onClick = (e: Event) => {
      e.stopPropagation();
      press.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      press.current();
    };
    el.addEventListener('click', onClick);
    el.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('click', onClick);
      el.removeEventListener('keydown', onKey);
    };
  }, [el]);
  return el;
}

type WebPhotoMarkerProps = {
  lib: MapLibre;
  map: MapLibreMap;
  point: MapPoint;
  onPress: (id: string) => void;
};

function WebPhotoMarkerView({ lib, map, point, onPress }: WebPhotoMarkerProps) {
  const el = useMarkerElement(() => onPress(point.id), {
    label: point.name ?? '',
    pressed: !!point.selected,
    zIndex: markerZIndex(point),
  });
  useEffect(() => {
    const marker = new lib.Marker({ element: el }).setLngLat([point.lng, point.lat]).addTo(map);
    return () => void marker.remove();
  }, [lib, map, el, point.lng, point.lat]);
  return createPortal(
    <PhotoMarker
      imageUrl={point.imageUrl ?? null}
      name={point.name ?? ''}
      selected={point.selected}
      order={point.order}
    />,
    el,
  );
}

/**
 * One place as a round photo marker on the web map, re-rendered only when what it shows
 * changes (D-051): a new selection re-renders two markers, not all of them.
 * @example <WebPhotoMarker lib={maplibregl} map={map} point={p} onPress={select} />
 */
export const WebPhotoMarker = memo(
  WebPhotoMarkerView,
  (a: WebPhotoMarkerProps, b: WebPhotoMarkerProps) =>
    a.lib === b.lib &&
    a.map === b.map &&
    a.onPress === b.onPress &&
    samePhotoMarker(a.point, b.point),
);

/**
 * The selected place's card, in maplibre's Popup above its marker.
 * @example <WebPopup lib={maplibregl} map={map} lngLat={[4.88, 52.36]}><Card /></WebPopup>
 */
export function WebPopup({
  lib,
  map,
  lngLat,
  insets,
  children,
}: {
  lib: MapLibre;
  map: MapLibreMap;
  lngLat: [number, number];
  /** Bands covered by the app's floating UI; the map pans the popup out of them. */
  insets?: MapInsets;
  children: ReactNode;
}) {
  const [el] = useState(() => document.createElement('div'));
  const [lng, lat] = lngLat;
  const { top = 0, bottom = 0 } = insets ?? {};
  useEffect(() => {
    const popup = new lib.Popup({
      closeButton: false,
      closeOnClick: false, // the map's own press handler closes it (onMapPress)
      maxWidth: 'none',
      className: 'wayfarer-popup',
      // Clear of the selected marker (half its size plus its ring) on whichever side it opens.
      offset: MARKER_SELECTED_SIZE / 2 + 8,
    })
      .setDOMContent(el)
      .setLngLat([lng, lat])
      .addTo(map);
    return () => void popup.remove();
  }, [lib, map, el, lng, lat]);
  // maplibre keeps the popup inside the map; the app's floating controls also cover part of
  // it, so pan once the card is laid out (next frame) if it sits under them.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const box = el.closest('.maplibregl-popup')?.getBoundingClientRect();
      if (!box) return;
      const dy = popupPanY(box, map.getContainer().getBoundingClientRect(), { top, bottom });
      if (dy !== 0) map.panBy([0, dy], { duration: 300 });
    });
    return () => cancelAnimationFrame(frame);
  }, [map, el, lng, lat, top, bottom]);
  return createPortal(children, el);
}
