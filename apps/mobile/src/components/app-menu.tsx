import { Image, type ImageSource } from 'expo-image';
import { router, usePathname, type Href } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from './icon';
import { Tappable } from './tappable';
import { Text } from './text';

import { MIN_TOUCH, radius, spacing } from '@/theme/colors';
import { useShadows, useTheme } from '@/theme/use-theme';

/** The logo symbol: a white swallow on the brick-red brand tile (256 px, enough for @3x at 64 pt). */
export const BRAND_SYMBOL: ImageSource = require('../../assets/images/brand-swallow.png');

/**
 * The Travelist logo: rounded swallow symbol, optionally followed by the wordmark.
 * @example <BrandMark size={40} withName />
 */
export function BrandMark({
  size = 32,
  withName,
  nameSize,
}: {
  size?: number;
  withName?: boolean;
  /** Font size of the wordmark; the subtitle size by default. */
  nameSize?: number;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <View style={styles.brand}>
      <Image
        testID="brand-symbol"
        source={BRAND_SYMBOL}
        accessibilityIgnoresInvertColors
        style={{ width: size, height: size, borderRadius: size * 0.3 }}
      />
      {withName ? (
        <Text
          variant="subtitle"
          style={[
            { color: theme.primary },
            nameSize ? { fontSize: nameSize, lineHeight: nameSize * 1.3, fontWeight: '700' } : null,
          ]}>
          {t('common.appName')}
        </Text>
      ) : null}
    </View>
  );
}

type MenuItem = { href: Href; path: string; label: string; icon: IconName };

function useMenuItems(): MenuItem[] {
  const { t } = useTranslation();
  return [
    { href: '/', path: '/', label: t('tabs.explore'), icon: 'search' },
    { href: '/trips', path: '/trips', label: t('tabs.trips'), icon: 'luggage' },
    { href: '/profile', path: '/profile', label: t('tabs.profile'), icon: 'person' },
    { href: '/about', path: '/about', label: t('about.title'), icon: 'info' },
  ];
}

/**
 * Header button (logo + menu glyph) that opens the app menu: a way back to Explore, My Trips,
 * Profile or About from any stacked screen, including pages opened from a link.
 */
export function AppMenuButton() {
  const { t } = useTranslation();
  const theme = useTheme();
  const shadows = useShadows();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Tappable
        accessibilityRole="button"
        accessibilityLabel={t('menu.open')}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        pressScale={0.95}
        testID="app-menu"
        style={({ hovered }) => [
          styles.pill,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border,
            boxShadow: hovered ? shadows.raised : shadows.card,
          },
        ]}>
        <Icon name="menu" size={18} />
        <BrandMark size={28} />
      </Tappable>
      <AppMenu visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** Dropdown anchored under the header's right edge. */
function AppMenu({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const theme = useTheme();
  const shadows = useShadows();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const items = useMenuItems();
  const go = (href: Href) => {
    onClose();
    router.navigate(href);
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} />
      <View
        accessibilityRole="menu"
        style={[
          styles.menu,
          {
            top: insets.top + 56,
            backgroundColor: theme.surface,
            borderColor: theme.border,
            boxShadow: shadows.raised,
          },
        ]}>
        <View style={[styles.menuHeader, { borderColor: theme.border }]}>
          <BrandMark size={28} withName />
        </View>
        {items.map((item) => (
          <MenuRow
            key={item.path}
            item={item}
            active={pathname === item.path}
            onPress={() => go(item.href)}
          />
        ))}
      </View>
    </Modal>
  );
}

function MenuRow({
  item,
  active,
  onPress,
}: {
  item: MenuItem;
  active: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const color = active ? theme.primary : theme.text;
  return (
    <Tappable
      accessibilityRole="menuitem"
      accessibilityLabel={item.label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      pressScale={1}
      style={({ hovered, pressed }) => [
        styles.row,
        { backgroundColor: hovered || pressed ? theme.surfaceMuted : 'transparent' },
      ]}>
      <Icon name={item.icon} size={20} color={color} />
      <Text style={{ color, fontWeight: active ? '600' : '400' }}>{item.label}</Text>
    </Tappable>
  );
}

const styles = StyleSheet.create({
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH - 2,
    paddingLeft: spacing.md - 4,
    paddingRight: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  menu: {
    position: 'absolute',
    right: spacing.md - 4,
    width: 260,
    paddingBottom: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  menuHeader: {
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md - 4,
    minHeight: MIN_TOUCH + 4,
    paddingHorizontal: spacing.md,
  },
});
