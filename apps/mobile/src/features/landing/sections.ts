/** Landing sections the header links scroll to. */
export type LandingSection = 'features' | 'how' | 'destinations';

/** Top of each section inside the page's scroll view, filled in as they lay out. */
export type SectionOffsets = Partial<Record<LandingSection, number>>;

/**
 * Scroll position that brings `section` just below the sticky header; null before it is laid out.
 * @example sectionScrollY({ how: 1800 }, 'how', 72) // 1728
 */
export function sectionScrollY(
  offsets: SectionOffsets,
  section: LandingSection,
  headerHeight: number,
): number | null {
  const top = offsets[section];
  if (top == null) return null;
  return Math.max(0, top - headerHeight);
}
