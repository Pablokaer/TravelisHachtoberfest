import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform } from 'react-native';

const useNativeDriver = Platform.OS !== 'web';
const RISE = 16;

/**
 * A soft fade and rise when the page opens (D-072); shown at once when the system asks for
 * reduced motion.
 * @example const fade = useFadeIn(150); <Animated.View style={fade}>…</Animated.View>
 */
export function useFadeIn(delay = 0, duration = 700) {
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      if (reduce) return progress.setValue(1);
      const easing = Easing.out(Easing.cubic);
      Animated.timing(progress, { toValue: 1, delay, duration, easing, useNativeDriver }).start();
    });
    return () => {
      cancelled = true;
    };
  }, [progress, delay, duration]);
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [RISE, 0] });
  return { opacity: progress, transform: [{ translateY }] };
}
