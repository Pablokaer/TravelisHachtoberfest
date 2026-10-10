import {
  StyleSheet,
  Text as RNText,
  type TextProps as RNTextProps,
  type TextStyle,
} from 'react-native';

import { fontFamilyFor } from '@/theme/fonts';
import { useTheme } from '@/theme/use-theme';

/**
 * Type scale (D-020):
 * display – tab root titles · title – page titles · heading – section titles ·
 * subtitle – card titles · body · label – form labels, buttons · caption – metadata ·
 * helper – hints and fine print.
 */
type Variant =
  'display' | 'title' | 'heading' | 'subtitle' | 'body' | 'label' | 'caption' | 'helper';

export type TextProps = RNTextProps & { variant?: Variant; secondary?: boolean };

const HEADERS = new Set<Variant>(['display', 'title', 'heading']);

export function Text({ variant = 'body', secondary, style, ...rest }: TextProps) {
  const theme = useTheme();
  const { fontWeight, ...flat }: TextStyle = StyleSheet.flatten([styles[variant], style]) ?? {};
  return (
    <RNText
      accessibilityRole={HEADERS.has(variant) ? 'header' : undefined}
      style={[
        { color: secondary ? theme.textSecondary : theme.text },
        flat,
        { fontFamily: flat.fontFamily ?? fontFamilyFor(fontWeight) },
      ]}
      {...rest}
    />
  );
}

// Font sizes scale with the OS setting (allowFontScaling defaults to true).
const styles = StyleSheet.create({
  display: { fontSize: 32, lineHeight: 38, fontWeight: '700', letterSpacing: -0.6 },
  title: { fontSize: 26, lineHeight: 32, fontWeight: '700', letterSpacing: -0.4 },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '600', letterSpacing: -0.2 },
  subtitle: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24 },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: 14, lineHeight: 20 },
  helper: { fontSize: 12, lineHeight: 16 },
});
