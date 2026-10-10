import { useMemo, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { useCities, type City } from '@/features/destinations/api';
import { FeatureStrip } from '@/features/landing/feature-strip';
import { FinalCta } from '@/features/landing/final-cta';
import { HeroSection } from '@/features/landing/hero-section';
import { HowItWorks } from '@/features/landing/how-it-works';
import { LANDING_HEADER_HEIGHT, LandingHeader } from '@/features/landing/landing-header';
import { LandingFooter } from '@/features/landing/landing-footer';
import { landingLayout } from '@/features/landing/layout';
import { PopularDestinations } from '@/features/landing/popular-destinations';
import {
  sectionScrollY,
  type LandingSection,
  type SectionOffsets,
} from '@/features/landing/sections';
import { useTheme } from '@/theme/use-theme';

/** Cities and countries Travelist covers, for the hero's eyebrow; null until loaded. */
function coverageOf(cities: City[] | undefined) {
  if (!cities?.length) return null;
  return { cities: cities.length, countries: new Set(cities.map((c) => c.countryCode)).size };
}

/**
 * Scrolls the page to its sections. Each is measured when a link is pressed, not on layout:
 * on the web a section that only moves (the hero's eyebrow arrives with the city list) does
 * not lay out again, so a stored offset would go stale.
 */
function useSectionScroll() {
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const sectionRefs = useRef<Partial<Record<LandingSection, View | null>>>({});
  const sectionRef = (section: LandingSection) => (node: View | null) => {
    sectionRefs.current[section] = node;
  };
  const scrollTo = (section: LandingSection) => {
    const node = sectionRefs.current[section];
    if (!node || !contentRef.current) return;
    node.measureLayout(contentRef.current, (_x, y) => {
      // The content starts below the header bar, which the section must clear.
      const offsets: SectionOffsets = { [section]: y + LANDING_HEADER_HEIGHT };
      const top = sectionScrollY(offsets, section, LANDING_HEADER_HEIGHT);
      if (top != null) scrollRef.current?.scrollTo({ y: top, animated: true });
    });
  };
  const scrollTop = () => scrollRef.current?.scrollTo({ y: 0, animated: true });
  return { scrollRef, contentRef, sectionRef, scrollTo, scrollTop };
}

/**
 * The landing page (D-072), where signed-out visitors start on the web: what Travelist does,
 * the app itself, real destinations, and the way to sign up or in.
 */
export default function WelcomeScreen() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const layout = landingLayout(width);
  const cities = useCities();
  const counts = useMemo(() => coverageOf(cities.data), [cities.data]);
  const { scrollRef, contentRef, sectionRef, scrollTo, scrollTop } = useSectionScroll();
  const [scrolled, setScrolled] = useState(false);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    setScrolled(e.nativeEvent.contentOffset.y > 8);
  const gap = { height: layout.sectionGap };

  return (
    <ScrollView
      ref={scrollRef}
      stickyHeaderIndices={[0]}
      onScroll={onScroll}
      scrollEventThrottle={32}
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.page}>
      <LandingHeader layout={layout} elevated={scrolled} onNavigate={scrollTo} onHome={scrollTop} />
      <View ref={contentRef}>
        <HeroSection layout={layout} counts={counts} onSeeHow={() => scrollTo('how')} />
        <View ref={sectionRef('features')} style={styles.features}>
          <FeatureStrip layout={layout} width={width} />
        </View>
        <View style={gap} />
        <View ref={sectionRef('destinations')}>
          <PopularDestinations
            layout={layout}
            width={width}
            cities={cities.data ?? null}
            failed={cities.isError}
          />
        </View>
        <View style={gap} />
        <View ref={sectionRef('how')}>
          <HowItWorks layout={layout} width={width} />
        </View>
        <View style={gap} />
        <FinalCta layout={layout} />
        <View style={gap} />
        <LandingFooter layout={layout} onNavigate={scrollTo} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1 },
  features: { paddingTop: 8 },
});
