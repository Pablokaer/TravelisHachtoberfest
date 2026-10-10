import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { LANDING_MAX_WIDTH } from './layout';

import { Text } from '@/components/text';
import { spacing } from '@/theme/colors';

/**
 * The landing page's content column: centred, at most LANDING_MAX_WIDTH wide, with the gutter.
 * @example <LandingContainer gutter={layout.gutter}>…</LandingContainer>
 */
export function LandingContainer({
  gutter,
  style,
  children,
}: PropsWithChildren<{ gutter: number; style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.container, { paddingHorizontal: gutter }, style]}>{children}</View>;
}

/**
 * A section's title and one-line subtitle.
 * @example <SectionHeading title="Popular destinations" subtitle="Get inspired…" />
 */
export function SectionHeading({
  title,
  subtitle,
  centered,
  compact,
}: {
  title: string;
  subtitle?: string;
  centered?: boolean;
  /** Phone sizes. */
  compact?: boolean;
}) {
  return (
    <View style={[styles.heading, centered && styles.centered]}>
      <Text
        variant="title"
        style={[styles.title, compact && styles.titleCompact, centered && styles.textCentered]}>
        {title}
      </Text>
      {subtitle ? (
        <Text secondary style={[styles.subtitle, centered && styles.textCentered]}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', maxWidth: LANDING_MAX_WIDTH, alignSelf: 'center' },
  heading: { gap: spacing.sm, flexShrink: 1 },
  centered: { alignItems: 'center' },
  title: { fontSize: 36, lineHeight: 42, letterSpacing: -1 },
  titleCompact: { fontSize: 28, lineHeight: 34, letterSpacing: -0.6 },
  subtitle: { fontSize: 17, lineHeight: 26 },
  textCentered: { textAlign: 'center' },
});
