import { SUPPORTED_LANGUAGES } from '@wayfarer/shared';
import { Link, router, type Href } from 'expo-router';
import { useState, type PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { signInWithOAuth, type OAuthProvider } from './api';

import { BrandMark } from '@/components/app-menu';
import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { env } from '@/lib/env';
import { radius, spacing } from '@/theme/colors';
import { fontFamilyFor } from '@/theme/fonts';
import { useBreakpoint, useShadows, useTheme } from '@/theme/use-theme';

export function FormError({ message }: { message: string | null }) {
  const theme = useTheme();
  if (!message) return null;
  return (
    <View style={[styles.error, { backgroundColor: theme.primarySoft }]}>
      <Icon name="error" size={18} color={theme.danger} />
      <Text accessibilityRole="alert" variant="caption" style={{ color: theme.danger, flex: 1 }}>
        {message}
      </Text>
    </View>
  );
}

/** Inline underlined text link (secondary navigation such as "create an account"). */
export function TextLink({ href, label }: { href: Href; label: string }) {
  const theme = useTheme();
  return (
    <Link
      href={href}
      style={[styles.link, { color: theme.text, fontFamily: fontFamilyFor('600') }]}>
      {label}
    </Link>
  );
}

/**
 * Centred auth layout: brand mark and title on top, form in a card on tablets and desktop
 * (full-bleed on phones).
 */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: PropsWithChildren<{ title: string; subtitle?: string; footer?: React.ReactNode }>) {
  const theme = useTheme();
  const shadows = useShadows();
  const { isTablet } = useBreakpoint();
  return (
    <Screen width="form" centered>
      <View style={styles.brand}>
        <BrandMark size={40} withName />
      </View>
      <View
        style={[
          styles.panel,
          isTablet && [
            styles.card,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              boxShadow: shadows.raised,
            },
          ],
        ]}>
        <View style={styles.heading}>
          <Text variant="title" style={styles.centerText}>
            {title}
          </Text>
          {subtitle ? (
            <Text secondary style={styles.centerText}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {children}
      </View>
      {footer}
    </Screen>
  );
}

export function OAuthButtons({ onError }: { onError: (message: string) => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [busy, setBusy] = useState<OAuthProvider | null>(null);
  if (env.authProviders.length === 0) return null;

  const run = async (provider: OAuthProvider) => {
    setBusy(provider);
    try {
      await signInWithOAuth(provider);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // Users closing the Apple sheet is not an error worth showing.
      if (!/cancel/i.test(message)) onError(message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.oauth}>
      <View style={styles.divider}>
        <View style={[styles.line, { backgroundColor: theme.border }]} />
        <Text secondary variant="helper">
          {t('auth.orContinueWith')}
        </Text>
        <View style={[styles.line, { backgroundColor: theme.border }]} />
      </View>
      {env.authProviders.map((p) => (
        <Button
          key={p}
          variant="secondary"
          label={t(`auth.provider.${p}`)}
          loading={busy === p}
          disabled={busy !== null}
          onPress={() => void run(p)}
        />
      ))}
    </View>
  );
}

/**
 * EN/PT chips for signed-out screens, where there is no profile to keep the language in.
 * @example <LanguageSwitch />
 */
export function LanguageSwitch() {
  const { t, i18n } = useTranslation();
  return (
    <View
      style={styles.langs}
      accessibilityRole="radiogroup"
      accessibilityLabel={t('profile.language')}>
      {SUPPORTED_LANGUAGES.map((lng) => (
        <Chip
          key={lng}
          label={t(`profile.languageName.${lng}`)}
          selected={i18n.resolvedLanguage === lng}
          onPress={() => void i18n.changeLanguage(lng)}
        />
      ))}
    </View>
  );
}

export function AuthFooter() {
  const { t } = useTranslation();
  return (
    <View style={styles.footer}>
      <LanguageSwitch />
      <Button
        variant="ghost"
        compact
        icon="info"
        label={t('profile.about')}
        onPress={() => router.push('/about')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  error: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md - 4,
    borderRadius: radius.md,
  },
  link: {
    fontSize: 15,
    paddingVertical: spacing.sm,
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
  centerText: { textAlign: 'center' },
  brand: { alignSelf: 'center' },
  panel: { gap: spacing.md },
  card: {
    padding: spacing.xl,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  heading: { gap: spacing.sm, marginBottom: spacing.sm },
  oauth: { gap: spacing.sm },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
  footer: { alignItems: 'center', gap: spacing.sm },
  langs: { flexDirection: 'row', gap: spacing.sm },
});
