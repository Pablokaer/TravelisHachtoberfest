// Phones centre titles and short blocks (iPhone audit, D-076): one narrow column reads best
// centred. Tablets and desktop, with columns side by side, keep them at the start of the line.
import { StyleSheet } from 'react-native';

import { useBreakpoint } from '@/theme/use-theme';

/**
 * True on phones, where titles, card headings and the Reviews area are centred.
 * @example const centred = useCentredOnPhone(); <Text style={centred && centring.text} />
 */
export function useCentredOnPhone(): boolean {
  return !useBreakpoint().isTablet;
}

/** Styles applied when `useCentredOnPhone()` is true. */
export const centring = StyleSheet.create({
  /** Centred lines of text. */
  text: { textAlign: 'center' },
  /** A row whose items gather in the middle. */
  row: { justifyContent: 'center' },
  /** A row turned into a centred column (e.g. a title with its action below). */
  stack: { flexDirection: 'column', alignItems: 'center' },
  /** An item that sets its own alignSelf (e.g. Badge), put back in the middle of a column. */
  self: { alignSelf: 'center' },
  /** A block narrower than the screen, in the middle of it. */
  block: { alignSelf: 'center', width: '100%' },
});
