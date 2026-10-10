import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { LandingContainer } from './landing-section';
import type { LandingLayout } from './layout';

import { BrandMark } from '@/components/app-menu';
import { Button } from '@/components/button';
import { Text } from '@/components/text';
import { spacing } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

/**
 * The closing call to action before the footer (D-072): a soft brand-tinted panel with the one
 * red button.
 * @example <FinalCta layout={layout} />
 */
export function FinalCta({ layout }: { layout: LandingLayout }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const phone = layout.gutter < 32;
  return (
    <LandingContainer gutter={layout.gutter}>
      <View
        style={[styles.panel, phone && styles.panelPhone, { backgroundColor: theme.primarySoft }]}>
        <BrandMark size={56} />
        <Text variant="title" style={[styles.title, phone && styles.titlePhone]}>
          {t('landing.cta.title')}
        </Text>
        <Text secondary style={styles.text}>
          {t('landing.cta.text')}
        </Text>
        <Button
          label={t('landing.cta.button')}
          onPress={() => router.push('/sign-up')}
          style={[styles.button, phone && styles.buttonPhone]}
        />
      </View>
    </LandingContainer>
  );
}

const styles = StyleSheet.create({
  panel: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 64,
    paddingHorizontal: spacing.xl,
    borderRadius: 32,
  },
  panelPhone: { paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg, borderRadius: 24 },
  title: {
    fontSize: 40,
    lineHeight: 46,
    letterSpacing: -1.2,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  titlePhone: { fontSize: 30, lineHeight: 36, letterSpacing: -0.8 },
  text: { fontSize: 17, lineHeight: 26, textAlign: 'center', maxWidth: 460 },
  button: { minHeight: 54, paddingHorizontal: 32, borderRadius: 14, marginTop: spacing.sm },
  buttonPhone: { alignSelf: 'stretch' },
});
