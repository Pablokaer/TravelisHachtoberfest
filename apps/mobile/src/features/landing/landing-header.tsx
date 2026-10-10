import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';

import { LandingContainer } from './landing-section';
import type { LandingLayout } from './layout';
import type { LandingSection } from './sections';

import { BrandMark } from '@/components/app-menu';
import { Button, IconButton } from '@/components/button';
import { Tappable } from '@/components/tappable';
import { Text } from '@/components/text';
import { spacing } from '@/theme/colors';
import { useShadows, useTheme } from '@/theme/use-theme';

/** Height of the sticky header; section links scroll their target just below it. */
export const LANDING_HEADER_HEIGHT = 72;

const NAV = [
  { section: 'features', key: 'landing.nav.features' },
  { section: 'how', key: 'landing.nav.how' },
  { section: 'destinations', key: 'landing.nav.destinations' },
] as const satisfies readonly { section: LandingSection; key: string }[];

type HeaderProps = {
  layout: LandingLayout;
  /** The page has scrolled: the header gets its divider and a soft shadow. */
  elevated: boolean;
  onNavigate: (section: LandingSection) => void;
  onHome: () => void;
};

/** A header link: quiet grey text that darkens on hover, as on the rest of the web app. */
function NavLink({
  label,
  onPress,
  block,
}: {
  label: string;
  onPress: () => void;
  block?: boolean;
}) {
  const theme = useTheme();
  return (
    <Tappable
      onPress={onPress}
      accessibilityRole="button"
      pressScale={1}
      style={[styles.navLink, block && styles.navLinkBlock]}>
      {({ hovered }) => (
        <Text
          variant="label"
          style={[styles.navText, { color: hovered ? theme.text : theme.textSecondary }]}>
          {label}
        </Text>
      )}
    </Tappable>
  );
}

function AuthActions({ compact }: { compact: boolean }) {
  const { t } = useTranslation();
  return (
    <View style={styles.actions}>
      {compact ? null : (
        <Button
          variant="secondary"
          compact
          label={t('landing.logIn')}
          onPress={() => router.push('/sign-in')}
        />
      )}
      <Button compact label={t('landing.getStarted')} onPress={() => router.push('/sign-up')} />
    </View>
  );
}

/** Phones and small tablets: the section links and "Log in" under the header bar. */
function MobileMenu({ onNavigate }: { onNavigate: (section: LandingSection) => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View style={[styles.menu, { borderTopColor: theme.border }]}>
      {NAV.map(({ section, key }) => (
        <NavLink key={section} label={t(key)} onPress={() => onNavigate(section)} block />
      ))}
      <Button
        variant="secondary"
        label={t('landing.logIn')}
        onPress={() => router.push('/sign-in')}
      />
    </View>
  );
}

/**
 * The landing page's sticky header (D-072): logo, section links, "Log in" and "Get started";
 * a menu button replaces the links on narrow screens.
 * @example <LandingHeader layout={layout} elevated={scrolled} onNavigate={scrollTo} onHome={top} />
 */
export function LandingHeader({ layout, elevated, onNavigate, onHome }: HeaderProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const shadows = useShadows();
  const [menuOpen, setMenuOpen] = useState(false);
  const compact = layout.compactHeader;
  const go = (section: LandingSection) => {
    setMenuOpen(false);
    onNavigate(section);
  };
  return (
    <View
      style={[
        styles.header,
        { borderBottomColor: elevated || menuOpen ? theme.border : 'transparent' },
        elevated && { boxShadow: shadows.card },
      ]}>
      <LandingContainer gutter={layout.gutter} style={styles.bar}>
        <Tappable
          onPress={onHome}
          accessibilityRole="button"
          accessibilityLabel={t('landing.nav.home')}
          pressScale={1}>
          <BrandMark size={34} withName nameSize={20} />
        </Tappable>
        {compact ? null : (
          <View style={styles.nav}>
            {NAV.map(({ section, key }) => (
              <NavLink key={section} label={t(key)} onPress={() => go(section)} />
            ))}
          </View>
        )}
        <View style={styles.right}>
          <AuthActions compact={compact} />
          {compact ? (
            <IconButton
              icon={menuOpen ? 'close' : 'menu'}
              accessibilityLabel={t(menuOpen ? 'landing.nav.closeMenu' : 'landing.nav.openMenu')}
              onPress={() => setMenuOpen((open) => !open)}
            />
          ) : null}
        </View>
      </LandingContainer>
      {compact && menuOpen ? (
        <LandingContainer gutter={layout.gutter}>
          <MobileMenu onNavigate={go} />
        </LandingContainer>
      ) : null}
    </View>
  );
}

// Frosted glass on the web, where content scrolls under the sticky header.
const glass =
  Platform.OS === 'web' ? ({ backdropFilter: 'saturate(180%) blur(16px)' } as ViewStyle) : null;

const styles = StyleSheet.create({
  header: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 10,
    ...glass,
  },
  bar: {
    height: LANDING_HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  nav: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  navLink: { paddingVertical: spacing.sm, paddingHorizontal: spacing.xs },
  navLinkBlock: { paddingVertical: spacing.md - 2 },
  navText: { fontSize: 15, lineHeight: 20 },
  right: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  menu: { borderTopWidth: StyleSheet.hairlineWidth, paddingBottom: spacing.md },
});
