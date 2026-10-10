// Design tokens (D-020): neutral surfaces, near-black text, one warm accent used only for
// primary actions, selection and active states. Light by default; the user can pick dark in
// Profile → Preferences (D-021).
export const palette = {
  light: {
    text: '#222222',
    textSecondary: '#6A6A6A',
    background: '#FFFFFF',
    /** Cards, sheets and bars. */
    surface: '#FFFFFF',
    /** Auxiliary backgrounds: inputs, image placeholders, stat tiles, hover. */
    surfaceMuted: '#F7F7F7',
    border: '#EBEBEB',
    /** Inputs and outlined controls. */
    borderStrong: '#DDDDDD',
    primary: '#D7383B',
    primaryPressed: '#B92E31',
    /** Tinted background for selected/active states. */
    primarySoft: '#FDECEC',
    onPrimary: '#FFFFFF',
    danger: '#B3261E',
    success: '#1E7F4F',
    warning: '#B25E09',
    info: '#1F5FAD',
    /** Filled rating stars (D-028): gold, the one warm colour besides the accent. */
    star: '#E5A50A',
    overlay: 'rgba(0,0,0,0.4)',
  },
  dark: {
    text: '#F5F5F5',
    textSecondary: '#A8A8A8',
    background: '#121212',
    surface: '#1C1C1E',
    surfaceMuted: '#252527',
    border: '#2E2E30',
    borderStrong: '#3C3C3F',
    primary: '#FF6B5C',
    primaryPressed: '#FF8577',
    primarySoft: '#3A1E1B',
    onPrimary: '#1A0806',
    danger: '#FF6F61',
    success: '#5FD39A',
    warning: '#F5B35C',
    info: '#7DB3F5',
    star: '#F5C542',
    overlay: 'rgba(0,0,0,0.6)',
  },
} as const;

export type ColorScheme = keyof typeof palette;
export type ThemeColors = { [K in keyof (typeof palette)['light']]: string };

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;
/** Minimum touch target (iOS HIG 44pt / Material 48dp). */
export const MIN_TOUCH = 44;

/**
 * Content widths: reading column, forms, the wide grid layouts and the full browse page
 * (Explore), whose header and card grid share one container.
 */
export const layout = { form: 440, content: 760, wide: 1200, page: 1440 } as const;

/** Soft elevation. Dark mode relies on surfaces and borders more than on shadows. */
export const shadows: Record<ColorScheme, { card: string; raised: string; floating: string }> = {
  light: {
    card: '0px 1px 2px rgba(0,0,0,0.06), 0px 4px 12px rgba(0,0,0,0.06)',
    raised: '0px 2px 4px rgba(0,0,0,0.06), 0px 8px 24px rgba(0,0,0,0.10)',
    floating: '0px 6px 16px rgba(0,0,0,0.14)',
  },
  dark: {
    card: '0px 1px 2px rgba(0,0,0,0.4)',
    raised: '0px 8px 24px rgba(0,0,0,0.5)',
    floating: '0px 6px 16px rgba(0,0,0,0.6)',
  },
};

/** Marker colours per attraction category (readable on light and dark map styles). */
export const categoryColors: Record<string, string> = {
  museum: '#7C3AED',
  monument: '#B45309',
  church: '#0E7490',
  castle: '#9F1239',
  viewpoint: '#15803D',
  landmark: '#1D4ED8',
  park: '#4D7C0F',
  nature: '#0F766E',
  palace: '#C2410C',
  other: '#475569',
};
