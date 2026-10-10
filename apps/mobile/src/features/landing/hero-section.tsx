import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Trans, useTranslation } from 'react-i18next';
import { Animated, Text as RNText, StyleSheet, View } from 'react-native';

import { LandingContainer } from './landing-section';
import type { LandingLayout } from './layout';
import { HERO_PHOTO, MOCK_CITIES, MOCK_STOPS } from './mock-data';
import { PhoneMockups } from './phone-mockups';
import { useFadeIn } from './use-fade-in';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { PhotoCredit } from '@/features/destinations/photo-credit';
import { gradient } from '@/theme/gradient';
import { radius, spacing } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

/** Fades that blend the photo into the white page: from the text side and at the bottom. */
const BLEED_FADES = [
  'linear-gradient(90deg, #FFFFFF 0%, rgba(255,255,255,0.75) 22%, rgba(255,255,255,0) 52%)',
  'linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 18%, rgba(255,255,255,0) 72%, #FFFFFF 100%)',
];
const PANEL_FADE = 'linear-gradient(180deg, rgba(255,255,255,0) 55%, rgba(255,255,255,0.35) 100%)';

/** Photos of places, standing in for traveller avatars: no invented people (D-072). */
const PROOF_PHOTOS = [MOCK_STOPS[3]!, MOCK_CITIES[1]!, MOCK_STOPS[1]!, MOCK_CITIES[0]!].map(
  (item) => item.photo.source,
);

/**
 * Lisbon behind the mockups: full-bleed to the window's edge beside the text, or a rounded panel
 * under it on phones; with its credit and a quiet handwritten-style note.
 */
function HeroPhoto({ bleed, gutter = 0 }: { bleed: boolean; gutter?: number }) {
  const { t } = useTranslation();
  return (
    <View
      style={[
        bleed ? styles.photoBleed : [styles.photoBand, { left: -gutter, right: -gutter }],
        styles.passThrough,
      ]}>
      <Image
        source={HERO_PHOTO.source}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        contentPosition={bleed ? 'left center' : 'center'}
        priority="high"
        accessibilityLabel={t('landing.hero.photo')}
      />
      {(bleed ? BLEED_FADES : [PANEL_FADE]).map((css) => (
        <View key={css} style={[StyleSheet.absoluteFill, gradient(css), styles.inert]} />
      ))}
      {bleed ? (
        <Text style={styles.note} aria-hidden>
          {t('landing.hero.note')}
        </Text>
      ) : null}
      {bleed ? <PhotoCredit cover={HERO_PHOTO} placement="bottom-right" /> : null}
    </View>
  );
}

/** The hero photo's credit on phones, as a caption: over the band, the phones would hide it. */
function StackedPhotoCredit() {
  const { t } = useTranslation();
  return (
    <Text variant="helper" secondary style={styles.stackedCredit}>
      {t('home.photoCredit', { author: HERO_PHOTO.author, license: HERO_PHOTO.license })}
    </Text>
  );
}

/** "N cities in M countries", from the real city list; nothing until it has loaded. */
function Eyebrow({
  cities,
  countries,
  centered,
}: {
  cities: number;
  countries: number;
  centered?: boolean;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <View
      style={[
        styles.eyebrow,
        centered && styles.eyebrowCentered,
        { backgroundColor: theme.primarySoft },
      ]}>
      <Icon name="pin" size={15} color={theme.primary} />
      <Text variant="label" style={{ color: theme.primary }}>
        {t('landing.hero.eyebrow', { cities, countries })}
      </Text>
    </View>
  );
}

function SocialProof({ centered }: { centered?: boolean }) {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <View style={[styles.proof, centered && styles.proofCentered]}>
      <View style={styles.avatars} aria-hidden importantForAccessibility="no-hide-descendants">
        {PROOF_PHOTOS.map((source, i) => (
          <Image
            key={i}
            source={source}
            style={[
              styles.avatar,
              i > 0 && styles.avatarOverlap,
              { borderColor: theme.background },
            ]}
          />
        ))}
      </View>
      <View style={styles.proofCopy}>
        <Text style={[styles.stars, { color: theme.star }]} aria-hidden>
          ★★★★★
        </Text>
        <Text variant="caption" secondary>
          {t('landing.hero.socialProof')}
        </Text>
      </View>
    </View>
  );
}

type HeroCopyProps = {
  layout: LandingLayout;
  counts: { cities: number; countries: number } | null;
  onSeeHow: () => void;
};

function HeroCopy({ layout, counts, onSeeHow }: HeroCopyProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const fade = useFadeIn();
  const size = layout.heroTitleSize;
  const stacked = !layout.splitHero;
  return (
    <Animated.View style={[styles.copy, !stacked && styles.copySide, fade]}>
      {counts ? <Eyebrow {...counts} centered={stacked} /> : null}
      <Text
        variant="display"
        style={[
          styles.title,
          stacked && styles.textCentered,
          { fontSize: size, lineHeight: size * 1.06 },
        ]}
        aria-level={1}>
        {/* `t` ties it to the language: without it the React Compiler keeps the first render. */}
        <Trans
          t={t}
          i18nKey="landing.hero.title"
          // A plain nested Text inherits the title's size; ours would reset it to body text.
          components={{ accent: <RNText style={{ color: theme.primary }} /> }}
        />
      </Text>
      <Text
        secondary
        style={[styles.subtitle, stacked && [styles.subtitleStacked, styles.textCentered]]}>
        {t('landing.hero.subtitle')}
      </Text>
      <View style={[styles.ctas, stacked && styles.ctasStacked]}>
        <Button
          label={t('landing.hero.start')}
          onPress={() => router.push('/sign-up')}
          style={styles.cta}
        />
        <Button
          variant="secondary"
          label={t('landing.hero.how')}
          onPress={onSeeHow}
          style={styles.cta}
        />
      </View>
      <SocialProof centered={stacked} />
    </Animated.View>
  );
}

/**
 * The landing page's first screen (D-072): the promise and the CTAs beside the app itself,
 * over a photo of Lisbon.
 * @example <HeroSection layout={layout} counts={counts} onSeeHow={() => scrollTo('how')} />
 */
export function HeroSection({ layout, counts, onSeeHow }: HeroCopyProps) {
  const split = layout.splitHero;
  return (
    <View style={styles.hero}>
      {split ? <HeroPhoto bleed /> : null}
      <LandingContainer
        gutter={layout.gutter}
        style={[styles.inner, split ? styles.innerSplit : styles.innerStacked]}>
        <HeroCopy layout={layout} counts={counts} onSeeHow={onSeeHow} />
        <View style={[styles.visual, split ? styles.visualSide : styles.visualStacked]}>
          {split ? null : <HeroPhoto bleed={false} gutter={layout.gutter} />}
          <PhoneMockups scale={layout.mockupScale} />
          {split ? null : <StackedPhotoCredit />}
        </View>
      </LandingContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { overflow: 'hidden' },
  passThrough: { pointerEvents: 'box-none' },
  inert: { pointerEvents: 'none' },
  photoBleed: { position: 'absolute', top: 0, bottom: 0, right: 0, left: '46%' },
  photoBand: { position: 'absolute', top: '16%', bottom: '16%', overflow: 'hidden' },
  note: {
    position: 'absolute',
    top: 28,
    right: 40,
    color: 'rgba(34,34,34,0.55)',
    fontSize: 15,
    fontStyle: 'italic',
    letterSpacing: 0.2,
    transform: [{ rotate: '-3deg' }],
  },
  inner: { gap: spacing.xxl },
  innerSplit: { flexDirection: 'row', alignItems: 'center', paddingVertical: 72 },
  innerStacked: { paddingTop: spacing.xl, paddingBottom: spacing.lg },
  copy: { gap: spacing.lg },
  copySide: { flex: 1, maxWidth: 560 },
  eyebrow: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md - 4,
    borderRadius: radius.pill,
  },
  textCentered: { textAlign: 'center', alignSelf: 'center' },
  eyebrowCentered: { alignSelf: 'center' },
  proofCentered: { justifyContent: 'center' },
  proofCopy: { flexShrink: 1 },
  title: { fontWeight: '700', letterSpacing: -1.8 },
  subtitle: { fontSize: 19, lineHeight: 30, maxWidth: 500 },
  subtitleStacked: { fontSize: 17, lineHeight: 26 },
  ctas: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md - 4, marginTop: spacing.xs },
  ctasStacked: { flexDirection: 'column', flexWrap: 'nowrap', alignItems: 'stretch' },
  cta: { minHeight: 54, paddingHorizontal: 28, borderRadius: 14 },
  proof: { flexDirection: 'row', alignItems: 'center', gap: spacing.md - 4, marginTop: spacing.sm },
  avatars: { flexDirection: 'row' },
  avatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 2 },
  avatarOverlap: { marginLeft: -10 },
  stars: { fontSize: 14, lineHeight: 18, letterSpacing: 1 },
  visual: { alignItems: 'center', justifyContent: 'center' },
  visualSide: { flex: 1 },
  visualStacked: { paddingTop: spacing.md },
  stackedCredit: { alignSelf: 'flex-end', marginTop: spacing.sm },
});
