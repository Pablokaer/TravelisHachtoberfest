// The web's fonts (D-059), loaded before the first screen: Inter as WOFF2 (the same glyphs as
// the apps' TTF, ~114 KiB instead of ~335 KiB per weight) and the icons' own cut of Material
// Symbols (3.9 KiB instead of 943 KiB). Built by scripts/build-web-fonts.py.
import { WEB_ICON_FONT } from '@/components/icon-names';

import inter400 from '../../assets/fonts/web/Inter_400Regular.woff2';
import inter500 from '../../assets/fonts/web/Inter_500Medium.woff2';
import inter600 from '../../assets/fonts/web/Inter_600SemiBold.woff2';
import inter700 from '../../assets/fonts/web/Inter_700Bold.woff2';
import icons from '../../assets/fonts/web/MaterialSymbolsApp.woff2';

export const fontAssets = {
  Inter_400Regular: inter400,
  Inter_500Medium: inter500,
  Inter_600SemiBold: inter600,
  Inter_700Bold: inter700,
  [WEB_ICON_FONT]: icons,
};
