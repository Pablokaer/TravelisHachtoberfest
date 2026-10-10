import { render, screen } from '@testing-library/react-native';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { ICONS, WEB_ICON_FONT } from '@/components/icon-names';
import { Icon as WebIcon } from '@/components/icon.web';
import codepoints from '@/components/web-icon-codepoints.json';
import { fontAssets as appFonts } from '@/theme/font-assets';
import { fontAssets as webFonts } from '@/theme/font-assets.web';

// The code points expo-symbols draws each Material Symbols icon with (its exports map hides the
// file, so it is read next to the package's entry point).
const materialSymbols = JSON.parse(
  readFileSync(join(dirname(require.resolve('expo-symbols')), 'android', 'symbols.json'), 'utf8'),
) as Record<string, number>;
const glyphs: Record<string, number> = codepoints;

describe('web icons (D-059)', () => {
  test("every icon has its glyph in the app's icon font, at Material Symbols' own code point", () => {
    for (const { web } of Object.values(ICONS)) expect(glyphs[web]).toBe(materialSymbols[web]);
  });

  test('an icon is drawn as its glyph in the icon font, at its size and colour', () => {
    render(<WebIcon name="search" size={24} color="#123456" />);
    const glyph = screen.getByText(String.fromCodePoint(materialSymbols.search!), {
      includeHiddenElements: true,
    });
    expect(glyph).toHaveStyle({ fontFamily: WEB_ICON_FONT, fontSize: 24, color: '#123456' });
  });
});

describe('web fonts (D-059)', () => {
  test('the web loads the same Inter families as the apps, plus the icon font', () => {
    expect(Object.keys(webFonts).sort()).toEqual([...Object.keys(appFonts), WEB_ICON_FONT].sort());
  });
});
