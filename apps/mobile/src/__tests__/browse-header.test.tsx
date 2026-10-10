import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { t } from 'i18next';
import { Text } from 'react-native';

import { BrowseHeader, inlineHeaderMinWidth } from '@/features/destinations/browse-header';
import { CityHeader } from '@/features/destinations/city-header';
import '@/lib/i18n';
import { fakeCity } from '@/testing/fixtures';

const GUTTER = 32;
const container = { paddingHorizontal: GUTTER };
const amsterdam = fakeCity();

function renderCityHeader() {
  const onOpenChecklist = jest.fn();
  render(
    <CityHeader
      cities={[amsterdam]}
      city={amsterdam}
      onSelectCity={jest.fn()}
      search={<Text>search field</Text>}
      categories={[]}
      onToggleCategory={jest.fn()}
      onClearCategories={jest.fn()}
      minRating={null}
      onChangeMinRating={jest.fn()}
      onOpenChecklist={onOpenChecklist}
      container={container}
      gutter={GUTTER}
    />,
  );
  return { onOpenChecklist };
}

/** Simulates the header container being laid out with `contentWidth` px inside the gutters. */
function layoutHeader(contentWidth: number) {
  fireEvent(screen.getByTestId('browse-header-container'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, height: 64, width: contentWidth + 2 * GUTTER } },
  });
}

// Jest's default window (750 px) is a tablet for useBreakpoint.
describe('CityHeader', () => {
  test('stacks city + search under the logo row when the content is narrow', () => {
    renderCityHeader();
    layoutHeader(inlineHeaderMinWidth(true) - 1);
    expect(screen.getByTestId('browse-header-stacked')).toBeOnTheScreen();
    expect(screen.queryByTestId('browse-header-inline')).toBeNull();
  });

  test('puts logo, city + search and the action in one row when they fit', () => {
    renderCityHeader();
    layoutHeader(inlineHeaderMinWidth(true));
    expect(screen.getByTestId('browse-header-inline')).toBeOnTheScreen();
    expect(screen.getByText('Travelist')).toBeOnTheScreen();
    expect(screen.getByText('search field')).toBeOnTheScreen();
  });

  test('keeps the checklist action and the category tabs', async () => {
    const { onOpenChecklist } = renderCityHeader();
    await userEvent.press(screen.getByTestId('open-checklist'));
    expect(onOpenChecklist).toHaveBeenCalled();
    expect(screen.getByRole('checkbox', { name: 'All' })).toBeChecked();
  });

  test('has no "Upgrade" while paid plans are hidden (D-065)', () => {
    renderCityHeader();
    expect(screen.queryByRole('button', { name: 'Upgrade' })).toBeNull();
  });

  test('shows the rating tabs after the category tabs', () => {
    renderCityHeader();
    expect(screen.getByLabelText('Filter by rating')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: '5 stars or more' })).toBeOnTheScreen();
  });
});

describe('BrowseHeader', () => {
  test('a search-only header (Home) goes inline earlier and has no category tabs', () => {
    render(<BrowseHeader search={<Text>cities</Text>} container={container} gutter={GUTTER} />);
    layoutHeader(inlineHeaderMinWidth(false));
    expect(inlineHeaderMinWidth(false)).toBeLessThan(inlineHeaderMinWidth(true));
    expect(screen.getByTestId('browse-header-inline')).toBeOnTheScreen();
    expect(screen.queryByRole('checkbox', { name: 'All' })).toBeNull();
  });

  test('the logo is a link to the Home', () => {
    render(<BrowseHeader search={<Text>cities</Text>} container={container} gutter={GUTTER} />);
    expect(screen.getByRole('link', { name: 'Travelist — all destinations' })).toBeOnTheScreen();
  });
});

describe('brand name', () => {
  test('the app is called Travelist in both languages; the about text names it', () => {
    for (const lng of ['en', 'pt'] as const) {
      expect(t('common.appName', { lng })).toBe('Travelist');
      expect(t('home.goHome', { lng })).toMatch(/^Travelist — /);
      expect(t('about.body', { lng })).toMatch(/Travelist/);
    }
  });
});
