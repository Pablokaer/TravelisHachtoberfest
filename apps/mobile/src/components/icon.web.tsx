import { StyleSheet, Text, View } from 'react-native';

import { ICONS, WEB_ICON_FONT, type IconName } from '@/components/icon-names';
import codepoints from '@/components/web-icon-codepoints.json';
import { useTheme } from '@/theme/use-theme';

export { categoryIcon, type IconName } from '@/components/icon-names';

/** Code point of each icon's glyph, as in Material Symbols (generated with the font). */
const GLYPHS: Record<string, number> = codepoints;

/**
 * An app icon on the web (D-059): its glyph in the app's cut of Material Symbols, loaded with
 * the app fonts — 3.9 KiB instead of the 943 KiB font expo-symbols loads for every icon.
 * @example <Icon name="search" size={20} />
 */
export function Icon({
  name,
  size = 20,
  color,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  const theme = useTheme();
  const glyph = String.fromCodePoint(GLYPHS[ICONS[name].web]!);
  // Decorative: a font glyph, so hidden from assistive tech (the control names itself).
  return (
    <View
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}>
      <Text
        selectable={false}
        style={[styles.glyph, { fontSize: size, lineHeight: size, color: color ?? theme.text }]}>
        {glyph}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  glyph: { fontFamily: WEB_ICON_FONT, fontWeight: 'normal', fontStyle: 'normal' },
});
