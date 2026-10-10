import {
  MOCKUP_WIDTH,
  benefitColumns,
  destinationCardWidth,
  landingLayout,
} from '@/features/landing/layout';
import { POPULAR_CITY_SLUGS, popularCities } from '@/features/landing/popular';
import { sectionScrollY } from '@/features/landing/sections';
import { signedOutHome } from '@/features/landing/signed-out-home';
import { gradient } from '@/theme/gradient';
import { fakeCity } from '@/testing/fixtures';

describe('signedOutHome (D-072)', () => {
  test('the web opens on the landing page, the native apps on sign-in', () => {
    expect(signedOutHome('web')).toBe('welcome');
    expect(signedOutHome('ios')).toBe('sign-in');
    expect(signedOutHome('android')).toBe('sign-in');
  });
});

describe('popularCities', () => {
  const city = (slug: string) => fakeCity({ slug, nameEn: slug });

  test('keeps the curated order and skips cities the database does not have', () => {
    const cities = [city('rome'), city('amsterdam'), city('paris'), city('tokyo')];
    const picked = popularCities(cities, ['paris', 'new-york', 'rome', 'tokyo']);
    expect(picked.map((c) => c.slug)).toEqual(['paris', 'rome', 'tokyo']);
  });

  test('the curated list holds only real, distinct slugs', () => {
    expect(new Set(POPULAR_CITY_SLUGS).size).toBe(POPULAR_CITY_SLUGS.length);
    expect(POPULAR_CITY_SLUGS).not.toContain('new-york');
  });
});

describe('landingLayout', () => {
  test('phones stack the hero in one column with a smaller headline', () => {
    const phone = landingLayout(390);
    expect(phone.splitHero).toBe(false);
    expect(phone.heroTitleSize).toBeLessThanOrEqual(40);
    expect(phone.gutter).toBe(20);
  });

  test('tablets keep two columns and shrink the phone mockups', () => {
    const tablet = landingLayout(960);
    expect(tablet.splitHero).toBe(true);
    expect(tablet.mockupScale).toBeLessThan(landingLayout(1440).mockupScale);
  });

  test('desktops get the full headline and mockups at full size', () => {
    const desktop = landingLayout(1440);
    expect(desktop.splitHero).toBe(true);
    expect(desktop.heroTitleSize).toBeGreaterThanOrEqual(60);
    expect(desktop.mockupScale).toBe(1);
  });

  test('the mockups never get wider than the screen', () => {
    for (const width of [320, 390, 600, 860, 1024, 1280]) {
      const { mockupScale, gutter, splitHero } = landingLayout(width);
      const available = splitHero ? width / 2 : width - 2 * gutter;
      expect(mockupScale * MOCKUP_WIDTH).toBeLessThanOrEqual(available + 1);
    }
  });
});

describe('sectionScrollY', () => {
  test('scrolls to the section top, below the sticky header', () => {
    expect(sectionScrollY({ features: 900 }, 'features', 72)).toBe(828);
  });

  test('never scrolls above the page and ignores sections not laid out yet', () => {
    expect(sectionScrollY({ features: 40 }, 'features', 72)).toBe(0);
    expect(sectionScrollY({}, 'how', 72)).toBeNull();
  });
});

describe('benefitColumns', () => {
  test('four in a row on desktops, two on tablets, one on phones', () => {
    expect(benefitColumns(1280)).toBe(4);
    expect(benefitColumns(800)).toBe(2);
    expect(benefitColumns(390)).toBe(1);
  });
});

describe('destinationCardWidth', () => {
  test('desktops fit every card in one row; smaller screens scroll fixed-width cards', () => {
    expect(destinationCardWidth(1280)).toBeNull();
    expect(destinationCardWidth(800)).toBe(200);
    expect(destinationCardWidth(390)).toBe(168);
  });
});

describe('gradient', () => {
  test('native apps draw the CSS gradient with experimental_backgroundImage', () => {
    const css = 'linear-gradient(180deg, #fff0, #fff)';
    expect(gradient(css)).toEqual({ experimental_backgroundImage: css });
  });
});
