import type { TextStyle } from 'react-native';

// The TTF files on iOS/Android, WOFF2 and the icon font on the web (font-assets.web.ts, D-059).
export { fontAssets } from './font-assets';

/**
 * Custom fonts ship one family per weight, so a `fontWeight` is mapped to the matching Inter
 * family (and dropped, so Android doesn't synthesise a second bold).
 */
export function fontFamilyFor(weight: TextStyle['fontWeight']): string {
  switch (String(weight ?? '400')) {
    case '500':
      return 'Inter_500Medium';
    case '600':
      return 'Inter_600SemiBold';
    case '700':
    case '800':
    case '900':
    case 'bold':
      return 'Inter_700Bold';
    default:
      return 'Inter_400Regular';
  }
}
