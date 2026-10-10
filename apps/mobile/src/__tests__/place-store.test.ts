import { usePlaceStore } from '@/features/suggested/place-store';

beforeEach(() =>
  usePlaceStore.setState({ position: null, chosenCity: 'lisbon', status: 'idle', placeHint: null }),
);

describe('place store (D-080)', () => {
  test('a typed place becomes the traveller’s position, replacing a city picked before', () => {
    usePlaceStore.getState().setTypedPlace({ lat: 35.01, lng: 135.77 });
    expect(usePlaceStore.getState()).toMatchObject({
      position: { lat: 35.01, lng: 135.77 },
      chosenCity: null,
      status: 'found',
    });
  });

  test('the name and country of a typed place are kept to tell it from its region', () => {
    usePlaceStore
      .getState()
      .setTypedPlace({ lat: 32.75, lng: 129.87 }, { name: 'Nagasaki', countryCode: 'JP' });
    expect(usePlaceStore.getState().placeHint).toEqual({ name: 'Nagasaki', countryCode: 'JP' });
    usePlaceStore.getState().chooseCity('lisbon');
    expect(usePlaceStore.getState().placeHint).toBeNull();
  });
});
