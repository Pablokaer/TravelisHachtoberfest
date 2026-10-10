import { Platform, type ViewStyle } from 'react-native';

/**
 * A CSS gradient as a view's background (D-072), without a gradient library: the browser reads
 * it as `background-image`; iOS and Android draw it through React Native's
 * `experimental_backgroundImage` (New Architecture).
 * @example <View style={[StyleSheet.absoluteFill, gradient('linear-gradient(#fff0, #fff)')]} />
 */
export function gradient(css: string): ViewStyle {
  if (Platform.OS === 'web') return { backgroundImage: css } as ViewStyle;
  return { experimental_backgroundImage: css };
}
