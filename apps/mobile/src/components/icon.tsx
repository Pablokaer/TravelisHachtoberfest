import { SymbolView } from 'expo-symbols';
import { View } from 'react-native';

import { ICONS, type IconName } from '@/components/icon-names';
import { useTheme } from '@/theme/use-theme';

export { categoryIcon, type IconName } from '@/components/icon-names';

/** An app icon: SF Symbols on iOS, Material Symbols on Android (web: icon.web.tsx). */
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
  // Decorative: the web build renders symbols as font glyphs, so hide them from assistive tech.
  return (
    <View
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}>
      <SymbolView name={ICONS[name]} size={size} tintColor={color ?? theme.text} />
    </View>
  );
}
