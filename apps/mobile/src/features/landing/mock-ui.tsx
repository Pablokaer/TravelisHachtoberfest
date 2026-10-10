// Small pieces of the app's own UI, drawn at mockup scale (D-072). Always the light palette: the
// mockups show the app as it looks by default, whatever the page's theme.
import type { PropsWithChildren } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, View, type TextStyle } from 'react-native';
import { useTranslation } from 'react-i18next';

import { BRAND_SYMBOL } from '@/components/app-menu';
import { Icon, type IconName } from '@/components/icon';
import { Text } from '@/components/text';
import { palette } from '@/theme/colors';

const c = palette.light;

/**
 * Fixed-size text for mockups: never scaled by the OS font size, so the phone stays a picture.
 * @example <MockText size={12} secondary>Portugal</MockText>
 */
export function MockText({
  size,
  weight = '400',
  secondary,
  color,
  style,
  children,
}: PropsWithChildren<{
  size: number;
  weight?: TextStyle['fontWeight'];
  secondary?: boolean;
  color?: string;
  style?: TextStyle;
}>) {
  const fg = color ?? (secondary ? c.textSecondary : c.text);
  const font: TextStyle = {
    fontSize: size,
    lineHeight: Math.round(size * 1.3),
    fontWeight: weight,
  };
  return (
    <Text allowFontScaling={false} numberOfLines={1} style={[font, { color: fg }, style]}>
      {children}
    </Text>
  );
}

/** The app header's logo, small. */
export function MockBrand() {
  const { t } = useTranslation();
  return (
    <View style={styles.brand}>
      <Image source={BRAND_SYMBOL} style={styles.brandSymbol} />
      <MockText size={15} weight="700" color={c.primary}>
        {t('common.appName')}
      </MockText>
    </View>
  );
}

/** A filter chip; the selected one is tinted with the accent. */
export function MockChip({
  label,
  icon,
  selected,
}: {
  label: string;
  icon?: IconName;
  selected?: boolean;
}) {
  const fg = selected ? c.primary : c.text;
  return (
    <View style={[styles.chip, selected ? styles.chipSelected : styles.chipIdle]}>
      {icon ? <Icon name={icon} size={13} color={fg} /> : null}
      <MockText size={11.5} weight="600" color={fg}>
        {label}
      </MockText>
    </View>
  );
}

type MockTab = 'explore' | 'trips' | 'profile';
const TABS: readonly { key: MockTab; icon: IconName }[] = [
  { key: 'explore', icon: 'search' },
  { key: 'trips', icon: 'luggage' },
  { key: 'profile', icon: 'person' },
];

/** The app's bottom tab bar, with `active` highlighted. */
export function MockTabBar({ active }: { active: MockTab }) {
  const { t } = useTranslation();
  return (
    <View style={styles.tabBar}>
      {TABS.map(({ key, icon }) => {
        const fg = key === active ? c.primary : c.textSecondary;
        return (
          <View key={key} style={styles.tab}>
            <Icon name={icon} size={19} color={fg} />
            <MockText size={9.5} weight="600" color={fg}>
              {t(`tabs.${key}`)}
            </MockText>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  brand: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brandSymbol: { width: 22, height: 22, borderRadius: 7 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  chipSelected: { backgroundColor: c.primarySoft, borderColor: c.primary },
  chipIdle: { backgroundColor: c.surface, borderColor: c.borderStrong },
  tabBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 64,
    paddingBottom: 16,
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.borderStrong,
    backgroundColor: 'rgba(255,255,255,0.96)',
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 1 },
});
