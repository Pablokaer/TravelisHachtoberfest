/** Design width of the two overlapping phone mockups at scale 1. */
export const MOCKUP_WIDTH = 540;
/** Design height of the two overlapping phone mockups at scale 1. */
export const MOCKUP_HEIGHT = 652;
/** Widest the landing content gets; the hero photo still runs to the window's edge. */
export const LANDING_MAX_WIDTH = 1200;

/** Sizes of the landing page for one window width. */
export type LandingLayout = {
  /** Hero text and mockups side by side (else stacked, text first). */
  splitHero: boolean;
  /** Header links collapse into a menu. */
  compactHeader: boolean;
  heroTitleSize: number;
  /** Scale of the phone mockups (1 = MOCKUP_WIDTH × MOCKUP_HEIGHT). */
  mockupScale: number;
  /** Side padding of every section. */
  gutter: number;
  /** Space between sections. */
  sectionGap: number;
};

function gutterFor(width: number): number {
  if (width < 600) return 20;
  return width < 1024 ? 32 : 48;
}

function heroTitleSizeFor(width: number): number {
  if (width < 600) return 38;
  if (width < 1024) return 48;
  return width < 1200 ? 56 : 64;
}

/** The mockups take the hero's right half when split, else the full content width. */
function mockupScaleFor(width: number, gutter: number, splitHero: boolean): number {
  const content = Math.min(width, LANDING_MAX_WIDTH) - 2 * gutter;
  const available = splitHero ? content / 2 : content;
  return Math.min(1, available / MOCKUP_WIDTH);
}

/**
 * The landing page's responsive sizes (D-072): split hero from 860 px, header menu below 900 px.
 * @example landingLayout(390).splitHero // false
 */
export function landingLayout(width: number): LandingLayout {
  const gutter = gutterFor(width);
  const splitHero = width >= 860;
  return {
    splitHero,
    compactHeader: width < 900,
    heroTitleSize: heroTitleSizeFor(width),
    mockupScale: mockupScaleFor(width, gutter, splitHero),
    gutter,
    sectionGap: width < 600 ? 72 : 112,
  };
}

/**
 * Columns of the benefits strip and the "how it works" steps: four in a row on desktops, two on
 * tablets, one on phones.
 * @example benefitColumns(1280) // 4
 */
export function benefitColumns(width: number): number {
  if (width >= 1024) return 4;
  return width >= 600 ? 2 : 1;
}

/**
 * Width of a "Popular destinations" card when the row scrolls sideways (tablets and phones); null
 * on desktops, where every card fits in one row.
 * @example destinationCardWidth(390) // 168
 */
export function destinationCardWidth(width: number): number | null {
  if (width >= 1024) return null;
  return width < 600 ? 168 : 200;
}
