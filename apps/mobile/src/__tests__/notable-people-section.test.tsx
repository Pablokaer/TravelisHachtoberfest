import { render, screen } from '@testing-library/react-native';

import type { NotablePerson } from '@/features/people/api';
import { NotablePeopleSection } from '@/features/people/notable-people-section';
import '@/lib/i18n';
import { fakeCity } from '@/testing/fixtures';
import { layOutAsIPhone } from '@/testing/phone-width';

/** What the server returned for the city's famous people. */
class MockPeopleBackend {
  static people: NotablePerson[] = [];
}

jest.mock('@/features/people/api', () => ({
  ...jest.requireActual('@/features/people/api'),
  useNotablePeople: () => ({ data: MockPeopleBackend.people }),
}));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));

const rembrandt: NotablePerson = {
  wikidataId: 'Q5598',
  nameEn: 'Rembrandt',
  namePt: null,
  descriptionEn: 'Dutch painter',
  descriptionPt: null,
  categories: ['art'],
  birthYear: 1606,
  deathYear: 1669,
  bornHere: false,
  diedHere: true,
  imageUrl: null,
  imageAuthor: null,
  imageLicense: null,
  wikipediaEn: 'Rembrandt',
  wikipediaPt: null,
};

beforeEach(() => {
  MockPeopleBackend.people = [rembrandt];
});

// iPhone audit (D-076): the Famous people filters and every element of a person's card are
// centred on phones.
describe('NotablePeopleSection on a phone', () => {
  layOutAsIPhone();

  test('centres the filters', () => {
    render(<NotablePeopleSection city={fakeCity()} />);
    expect(screen.getByTestId('people-filters')).toHaveStyle({ justifyContent: 'center' });
  });

  test('centres name, years, profession and "Died here"', () => {
    render(<NotablePeopleSection city={fakeCity()} />);
    expect(screen.getByText('Rembrandt')).toHaveStyle({ textAlign: 'center' });
    expect(screen.getByText('1606–1669')).toHaveStyle({ textAlign: 'center' });
    expect(screen.getByText('Dutch painter')).toHaveStyle({ textAlign: 'center' });
    expect(screen.getByTestId('person-connection')).toHaveStyle({ alignSelf: 'center' });
    expect(screen.getByText('Died here')).toBeOnTheScreen();
  });

  test('centres the Wikidata credit under the cards', () => {
    render(<NotablePeopleSection city={fakeCity()} />);
    expect(screen.getByText(/From Wikidata \(CC0\)/)).toHaveStyle({ textAlign: 'center' });
  });
});

describe('NotablePeopleSection on a tablet', () => {
  test("keeps the person's texts at the start of the line", () => {
    render(<NotablePeopleSection city={fakeCity()} />);
    expect(screen.getByText('Rembrandt')).not.toHaveStyle({ textAlign: 'center' });
  });
});
