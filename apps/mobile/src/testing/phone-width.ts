// Lays tests out at an iPhone's width. Jest's default window (750 px) is a tablet for
// useBreakpoint, so phone-only layouts (centred titles, D-076) need this.
import { Dimensions } from 'react-native';

/** iPhone 13 / 14 / 15 / 16: 390 × 844 points. */
const IPHONE = { width: 390, height: 844, scale: 3, fontScale: 1 };

/**
 * Registers beforeEach / afterEach hooks that switch the window to an iPhone and back.
 * @example describe('on a phone', () => { layOutAsIPhone(); test(…) });
 */
export function layOutAsIPhone(): void {
  let original: ReturnType<typeof Dimensions.get>;
  beforeEach(() => {
    original = Dimensions.get('window');
    Dimensions.set({ window: IPHONE, screen: IPHONE });
  });
  afterEach(() => {
    Dimensions.set({ window: original, screen: original });
  });
}
