import { render, screen, userEvent, within } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';

import AttractionScreen from '@/app/attraction/[id]';
import type { AttractionDetail } from '@/features/destinations/api';
import { useRouteStore } from '@/features/route/store';
import '@/lib/i18n';

/** Server data for one attraction with 128 reviews averaging 4.56. */
class MockAttractionServer {
  static detail: AttractionDetail = {
    id: 'a1',
    citySlug: 'lisbon',
    nameEn: 'Belém Tower',
    namePt: 'Torre de Belém',
    category: 'monument',
    lat: 38.69,
    lng: -9.21,
    popularity: 90,
    avgVisitMinutes: 45,
    imageUrl: null,
    isUnesco: true,
    descriptionEn: null,
    descriptionPt: null,
    imageAuthor: null,
    imageLicense: null,
    imageLicenseUrl: null,
    imagePageUrl: null,
    website: null,
    wikipediaEn: null,
    wikipediaPt: null,
    openingHours: null,
    fee: null,
    wikidataId: 'Q1',
    summaryEn: null,
    summaryPt: null,
    historyEn: null,
    historyPt: null,
  };
}

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: 'a1' }),
}));
jest.mock('@/features/destinations/api', () => ({
  ...jest.requireActual('@/features/destinations/api'),
  useAttraction: () => ({
    isPending: false,
    isError: false,
    data: { summary: MockAttractionServer.detail, detail: MockAttractionServer.detail },
  }),
}));
jest.mock('@/features/reviews/api', () => {
  const idle = { isPending: false, error: null, mutate: jest.fn() };
  return {
    ...jest.requireActual('@/features/reviews/api'),
    useReviews: () => ({ data: [], isPending: false }),
    useRatingSummary: () => ({ data: { count: 128, average: 4.56 } }),
    useSaveReview: () => idle,
    useDeleteReview: () => idle,
  };
});

test('the average rating sits with the title, and the reviews section is on the page', () => {
  render(<AttractionScreen />);
  const title = screen.getByTestId('attraction-title');
  expect(within(title).getByTestId('rating-summary')).toHaveTextContent('4.6 ★ · 128 reviews');
  expect(screen.getByText('Reviews')).toBeTruthy();
  expect(screen.getByTestId('review-form')).toBeTruthy();
});

test('the page adds a sixth place to the route: no plan limit (D-065)', async () => {
  useRouteStore.getState().clear();
  for (const id of ['b', 'c', 'd', 'e', 'f'])
    useRouteStore.getState().add({ ...MockAttractionServer.detail, id, lng: -9.2 });
  render(<AttractionScreen />);
  await userEvent.press(screen.getByTestId('toggle-route'));
  expect(useRouteStore.getState().stops).toHaveLength(6);
  expect(screen.queryByText(/places per list/)).toBeNull();
  expect(screen.getByRole('button', { name: 'Remove from route' })).toBeOnTheScreen();
});

describe('the Wikipedia story of the place (D-070)', () => {
  const plain = MockAttractionServer.detail;
  afterEach(() => {
    MockAttractionServer.detail = plain;
  });

  test('shows the introduction, its history and a link to the full article', async () => {
    MockAttractionServer.detail = {
      ...plain,
      descriptionEn: 'tower in Lisbon',
      wikipediaEn: 'Belém Tower',
      summaryEn: 'A 16th-century fortification that served as a gateway to Lisbon.',
      historyEn: 'King John II designed a defence system for the mouth of the Tagus.',
    };
    render(<AttractionScreen />);
    expect(screen.getByText(/gateway to Lisbon/)).toBeOnTheScreen();
    expect(screen.getByText('History')).toBeOnTheScreen();
    expect(screen.getByText(/defence system for the mouth of the Tagus/)).toBeOnTheScreen();
    expect(screen.getByText('From Wikipedia · CC BY-SA 4.0')).toBeOnTheScreen();
    // The one-line Wikidata description is redundant next to the introduction.
    expect(screen.queryByText('tower in Lisbon')).toBeNull();
    await userEvent.press(screen.getByRole('link', { name: 'Read the full article on Wikipedia' }));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(
      'https://en.wikipedia.org/wiki/Bel%C3%A9m_Tower',
    );
  });

  test('without an article text, the short description stays', () => {
    MockAttractionServer.detail = { ...plain, descriptionEn: 'tower in Lisbon' };
    render(<AttractionScreen />);
    expect(screen.getByText('tower in Lisbon')).toBeOnTheScreen();
    expect(screen.queryByText('History')).toBeNull();
  });
});
