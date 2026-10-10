import { DEFAULT_THEME } from '@wayfarer/shared';
import { createContext, useContext } from 'react';
import { useWindowDimensions } from 'react-native';

import { palette, shadows, type ColorScheme, type ThemeColors } from './colors';

/**
 * The colour scheme the user picked in Profile → Preferences (D-021). The system dark-mode
 * setting is not followed: the app is light until the user chooses dark.
 */
export const ColorSchemeContext = createContext<ColorScheme>(DEFAULT_THEME);

/**
 * Active colour scheme name.
 * @example const scheme = useColorSchemeName(); // 'light' | 'dark'
 */
export function useColorSchemeName(): ColorScheme {
  return useContext(ColorSchemeContext);
}

/**
 * Colour tokens for the active scheme.
 * @example const theme = useTheme(); <View style={{ backgroundColor: theme.surface }} />
 */
export function useTheme(): ThemeColors {
  return palette[useColorSchemeName()];
}

/** Elevation tokens for the active scheme. */
export function useShadows() {
  return shadows[useColorSchemeName()];
}

/** Breakpoints shared by every responsive layout (phone < 600 ≤ tablet < 1024 ≤ desktop). */
export function useBreakpoint() {
  const { width } = useWindowDimensions();
  return {
    width,
    isTablet: width >= 600,
    isDesktop: width >= 1024,
    /** Columns for card grids. */
    columns: width >= 1200 ? 4 : width >= 900 ? 3 : width >= 600 ? 2 : 1,
  };
}
