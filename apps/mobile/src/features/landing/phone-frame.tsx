import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

import { MOCKUP_WIDTH } from './layout';
import { MockText } from './mock-ui';

import { palette } from '@/theme/colors';

/** Design size of one phone mockup. */
export const PHONE = { width: 284, height: 588 } as const;
/** How much of the back phone's screen the front phone covers. */
export const PHONE_OVERLAP = 2 * PHONE.width - MOCKUP_WIDTH;

const BEZEL = 8;
const ink = palette.light.text;

/** iPhone-style status bar: time, the Dynamic Island, signal and battery. */
function PhoneStatusBar() {
  return (
    <View style={styles.statusBar}>
      <MockText size={14} weight="600">
        9:41
      </MockText>
      <View style={styles.island} />
      <View style={styles.statusIcons}>
        {[5, 7, 9, 11].map((h) => (
          <View key={h} style={[styles.signal, { height: h }]} />
        ))}
        <View style={styles.battery}>
          <View style={styles.batteryLevel} />
        </View>
      </View>
    </View>
  );
}

/**
 * A phone around a mockup screen: bezel, status bar and home indicator. The screen's content
 * fills the rest; a tab bar inside it sits on the bottom edge.
 * @example <PhoneFrame><DiscoverMock /></PhoneFrame>
 */
export function PhoneFrame({ children, raised }: PropsWithChildren<{ raised?: boolean }>) {
  return (
    <View style={[styles.phone, raised ? styles.shadowRaised : styles.shadow]}>
      <View style={styles.screen}>
        <PhoneStatusBar />
        <View style={styles.content}>{children}</View>
        <View style={styles.homeIndicator} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  phone: {
    width: PHONE.width,
    height: PHONE.height,
    padding: BEZEL,
    borderRadius: 48,
    backgroundColor: '#111114',
  },
  shadow: { boxShadow: '0px 24px 48px rgba(17,17,26,0.14), 0px 4px 12px rgba(17,17,26,0.08)' },
  shadowRaised: {
    boxShadow: '0px 32px 64px rgba(17,17,26,0.20), 0px 8px 20px rgba(17,17,26,0.10)',
  },
  screen: { flex: 1, borderRadius: 40, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  statusBar: {
    height: 46,
    paddingHorizontal: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  island: {
    position: 'absolute',
    top: 11,
    left: (PHONE.width - 2 * BEZEL - 86) / 2,
    width: 86,
    height: 25,
    borderRadius: 13,
    backgroundColor: '#000000',
  },
  statusIcons: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  signal: { width: 3, borderRadius: 1, backgroundColor: ink },
  battery: {
    marginLeft: 5,
    width: 22,
    height: 11,
    padding: 1.5,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: 'rgba(34,34,34,0.4)',
  },
  batteryLevel: { flex: 1, width: '80%', borderRadius: 1.5, backgroundColor: ink },
  content: { flex: 1 },
  homeIndicator: {
    position: 'absolute',
    bottom: 7,
    alignSelf: 'center',
    width: 104,
    height: 4,
    borderRadius: 2,
    backgroundColor: ink,
  },
});
