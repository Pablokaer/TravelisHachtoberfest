import { Link } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { LandingContainer } from './landing-section';
import type { LandingLayout } from './layout';
import { LANDING_PHOTO_CREDITS } from './mock-data';
import type { LandingSection } from './sections';

import { BrandMark } from '@/components/app-menu';
import { Tappable } from '@/components/tappable';
import { Text } from '@/components/text';
import { LanguageSwitch } from '@/features/auth/components';
import { fontFamilyFor } from '@/theme/fonts';
import { spacing } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

const PRODUCT_LINKS = [
  { section: 'features', key: 'landing.nav.features' },
  { section: 'how', key: 'landing.nav.how' },
  { section: 'destinations', key: 'landing.nav.destinations' },
] as const satisfies readonly { section: LandingSection; key: string }[];

/** "Author (licence)" for every bundled photo, joined for one line of fine print. */
function photoCreditsLine(): string {
  return LANDING_PHOTO_CREDITS.map((photo) => `${photo.author} (${photo.license})`).join(', ');
}

function FooterColumn({
  title,
  stacked,
  children,
}: {
  title: string;
  stacked: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.column, !stacked && styles.columnSide]}>
      <Text variant="label">{title}</Text>
      {children}
    </View>
  );
}

function SectionLink({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Tappable onPress={onPress} accessibilityRole="button" pressScale={1}>
      {({ hovered }) => (
        <Text variant="caption" style={{ color: hovered ? theme.text : theme.textSecondary }}>
          {label}
        </Text>
      )}
    </Tappable>
  );
}

/**
 * The landing page's footer (D-072): logo, language, section links, About, copyright and the
 * credits the bundled photos and the map require. Only pages that exist are linked.
 * @example <LandingFooter layout={layout} onNavigate={scrollTo} />
 */
export function LandingFooter({
  layout,
  onNavigate,
}: {
  layout: LandingLayout;
  onNavigate: (section: LandingSection) => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const stacked = layout.gutter < 32;
  return (
    <View style={[styles.footer, { borderTopColor: theme.border }]}>
      <LandingContainer gutter={layout.gutter} style={styles.inner}>
        <View style={[styles.top, stacked && styles.topStacked]}>
          <View style={[styles.brand, !stacked && styles.brandSide]}>
            <BrandMark size={32} withName />
            <Text secondary variant="caption" style={styles.tagline}>
              {t('landing.footer.tagline')}
            </Text>
            <LanguageSwitch />
          </View>
          <FooterColumn title={t('landing.footer.product')} stacked={stacked}>
            {PRODUCT_LINKS.map(({ section, key }) => (
              <SectionLink key={section} label={t(key)} onPress={() => onNavigate(section)} />
            ))}
          </FooterColumn>
          <FooterColumn title={t('landing.footer.company')} stacked={stacked}>
            <Link href="/about" style={[styles.link, { color: theme.textSecondary }]}>
              {t('landing.footer.about')}
            </Link>
          </FooterColumn>
        </View>
        <View style={[styles.bottom, { borderTopColor: theme.border }]}>
          <Text variant="helper" secondary>
            {t('landing.footer.copyright', { year: new Date().getFullYear() })}
          </Text>
          <Text variant="helper" secondary>
            {t('landing.footer.photos', { credits: photoCreditsLine() })} {t('landing.footer.map')}
          </Text>
        </View>
      </LandingContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: { borderTopWidth: 1, paddingTop: 56, paddingBottom: spacing.xl },
  inner: { gap: spacing.xl },
  top: { flexDirection: 'row', gap: spacing.xxl },
  topStacked: { flexDirection: 'column', gap: spacing.xl },
  brand: { gap: spacing.md, alignItems: 'flex-start' },
  brandSide: { flex: 2 },
  tagline: { maxWidth: 320 },
  column: { gap: spacing.md - 4, minWidth: 140 },
  columnSide: { flex: 1 },
  link: { fontSize: 14, lineHeight: 20, fontFamily: fontFamilyFor('400') },
  bottom: { borderTopWidth: 1, paddingTop: spacing.lg, gap: spacing.sm },
});
