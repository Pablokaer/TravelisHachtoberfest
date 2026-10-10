import { Animated, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { DiscoverMock } from './discover-mock';
import { MOCKUP_HEIGHT, MOCKUP_WIDTH } from './layout';
import { MyListMock } from './my-list-mock';
import { PHONE, PhoneFrame } from './phone-frame';
import { useFadeIn } from './use-fade-in';

/** The front phone's left edge: it overlaps the back one by PHONE.width − FRONT_LEFT. */
const FRONT_LEFT = MOCKUP_WIDTH - PHONE.width;
/** The back phone starts lower, so both screens' headers show. */
const BACK_TOP = MOCKUP_HEIGHT - PHONE.height;

/**
 * Two overlapping phones (D-072): the app's Home behind, a Lisbon walk list in front. Drawn at
 * MOCKUP_WIDTH × MOCKUP_HEIGHT and scaled as one picture, so both phones keep their proportions.
 * @example <PhoneMockups scale={layout.mockupScale} />
 */
export function PhoneMockups({ scale }: { scale: number }) {
  const { t } = useTranslation();
  const back = useFadeIn(150);
  const front = useFadeIn(300);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={t('landing.hero.mockups')}
      style={{ width: MOCKUP_WIDTH * scale, height: MOCKUP_HEIGHT * scale }}
      testID="phone-mockups">
      <View
        aria-hidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.canvas, { transform: [{ scale }] }]}>
        <Animated.View style={[styles.back, back]}>
          <PhoneFrame>
            <DiscoverMock />
          </PhoneFrame>
        </Animated.View>
        <Animated.View style={[styles.front, front]}>
          <PhoneFrame raised>
            <MyListMock />
          </PhoneFrame>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: MOCKUP_WIDTH,
    height: MOCKUP_HEIGHT,
    transformOrigin: 'top left',
  },
  back: { position: 'absolute', left: 0, top: BACK_TOP },
  front: { position: 'absolute', left: FRONT_LEFT, top: 0 },
});
