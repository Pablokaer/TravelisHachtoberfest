import { useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '@/theme/use-theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const useNativeDriver = Platform.OS !== 'web';

// Show focus rings for keyboard users only (the web equivalent of :focus-visible).
let keyboardModality = false;
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.addEventListener('keydown', () => (keyboardModality = true), true);
  document.addEventListener('pointerdown', () => (keyboardModality = false), true);
}

export type TapState = { pressed: boolean; hovered: boolean; focused: boolean };

export type TappableProps = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle> | ((state: TapState) => StyleProp<ViewStyle>);
  children?: React.ReactNode | ((state: TapState) => React.ReactNode);
  /** Scale while pressed; 1 disables the press-in animation. */
  pressScale?: number;
};

/**
 * Pressable with the shared micro-interactions: a gentle press-in scale, hover and
 * keyboard-focus state for web, and a high-contrast focus ring for keyboard users.
 */
export function Tappable({
  style,
  children,
  pressScale = 0.97,
  disabled,
  onPressIn,
  onPressOut,
  onHoverIn,
  onHoverOut,
  onFocus,
  onBlur,
  accessibilityState,
  ...rest
}: TappableProps) {
  const theme = useTheme();
  const [scale] = useState(() => new Animated.Value(1));
  const [state, setState] = useState<TapState>({ pressed: false, hovered: false, focused: false });
  const set = (patch: Partial<TapState>) => setState((s) => ({ ...s, ...patch }));
  const animate = (to: number) =>
    Animated.spring(scale, { toValue: to, useNativeDriver, speed: 40, bounciness: 0 }).start();

  const view: TapState = { ...state, hovered: state.hovered && !disabled };
  const showRing = state.focused && keyboardModality;

  return (
    <AnimatedPressable
      disabled={disabled}
      onPressIn={(e) => {
        set({ pressed: true });
        if (pressScale !== 1) animate(pressScale);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        set({ pressed: false });
        if (pressScale !== 1) animate(1);
        onPressOut?.(e);
      }}
      onHoverIn={(e) => {
        set({ hovered: true });
        onHoverIn?.(e);
      }}
      onHoverOut={(e) => {
        set({ hovered: false });
        onHoverOut?.(e);
      }}
      onFocus={(e) => {
        set({ focused: true });
        onFocus?.(e);
      }}
      onBlur={(e) => {
        set({ focused: false });
        onBlur?.(e);
      }}
      style={[
        typeof style === 'function' ? style(view) : style,
        showRing && {
          outlineColor: theme.text,
          outlineWidth: 2,
          outlineStyle: 'solid',
          outlineOffset: 2,
        },
        { transform: [{ scale }] },
        Platform.OS === 'web' && !disabled ? ({ cursor: 'pointer' } as ViewStyle) : null,
      ]}
      accessibilityState={accessibilityState}
      // react-native-web ignores accessibilityState, so mirror it as ARIA for the browser.
      aria-checked={accessibilityState?.checked}
      aria-selected={accessibilityState?.selected}
      aria-busy={accessibilityState?.busy}
      {...rest}>
      {typeof children === 'function' ? children(view) : children}
    </AnimatedPressable>
  );
}
