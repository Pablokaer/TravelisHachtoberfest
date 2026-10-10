import { DarkTheme, DefaultTheme, type Theme } from 'expo-router';

import { palette, type ColorScheme } from './colors';
import { fontFamilyFor } from './fonts';

/**
 * React Navigation theme (headers, tab bar, screen backgrounds) built from our tokens and Inter.
 * @example <ThemeProvider value={navigationTheme('dark')}>…</ThemeProvider>
 */
export function navigationTheme(scheme: ColorScheme): Theme {
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const colors = palette[scheme];
  return {
    ...base,
    fonts: {
      regular: { fontFamily: fontFamilyFor('400'), fontWeight: '400' },
      medium: { fontFamily: fontFamilyFor('500'), fontWeight: '500' },
      bold: { fontFamily: fontFamilyFor('600'), fontWeight: '600' },
      heavy: { fontFamily: fontFamilyFor('700'), fontWeight: '700' },
    },
    colors: {
      ...base.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
    },
  };
}
