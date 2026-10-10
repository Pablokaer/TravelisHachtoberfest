import { useCallback } from 'react';

import { palette, type ColorScheme } from '@/theme/colors';
import { useColorSchemeName } from '@/theme/use-theme';

/**
 * One colour per route when a selection is split (≤ 6 routes of 2 stops), per colour scheme.
 * The first is the accent; the others reuse the status hues so the palette stays small (D-022).
 */
const ROUTE_COLORS: Record<ColorScheme, readonly string[]> = {
  light: [
    palette.light.primary,
    palette.light.info,
    palette.light.success,
    '#7A3FB5',
    palette.light.warning,
    '#0E7C86',
  ],
  dark: [
    palette.dark.primary,
    palette.dark.info,
    palette.dark.success,
    '#C39BF0',
    palette.dark.warning,
    '#5FC9D2',
  ],
};

/** Colour of route `index` (0-based) in `scheme`, cycling past the last colour. */
export function routeColor(index: number, scheme: ColorScheme): string {
  const colors = ROUTE_COLORS[scheme];
  return colors[index % colors.length]!;
}

/**
 * Route colours for the active theme.
 * @example const colorOf = useRouteColor(); colorOf(1) // blue in light mode
 */
export function useRouteColor(): (index: number) => string {
  const scheme = useColorSchemeName();
  // Stable per scheme, so map points are only rebuilt when the routes or the theme change.
  return useCallback((index: number) => routeColor(index, scheme), [scheme]);
}
