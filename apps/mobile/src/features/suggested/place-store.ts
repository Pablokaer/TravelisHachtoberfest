// Where the traveller wants suggested routes (D-077): their GPS position or a city they chose.
// In-memory like the route tray, so leaving the tab and coming back keeps the answer.
import type { LatLng } from '@wayfarer/shared';
import { create } from 'zustand';

import type { PlaceHint } from './city-builder';
import { findUserPosition, type LocationSource } from './location';

export type PlaceStatus = 'idle' | 'locating' | 'found' | 'denied' | 'error';

type PlaceState = {
  position: LatLng | null;
  /** A city picked by hand; wins over the one nearest to the position. */
  chosenCity: string | null;
  /** Name and country of a place typed by name, sent along when it is resolved (D-080). */
  placeHint: PlaceHint | null;
  status: PlaceStatus;
  /** Reads the position; `askPermission` false only uses a permission already granted. */
  locate: (source: LocationSource, askPermission: boolean) => Promise<void>;
  chooseCity: (slug: string | null) => void;
  /** A place typed by name stands in for the GPS position (D-080). */
  setTypedPlace: (position: LatLng, hint?: PlaceHint) => void;
};

export const usePlaceStore = create<PlaceState>((set) => ({
  position: null,
  chosenCity: null,
  placeHint: null,
  status: 'idle',
  locate: async (source, askPermission) => {
    set({ status: 'locating' });
    const result = await findUserPosition(source, askPermission);
    if (result.status === 'found') {
      // Locating again returns to "near you": a city picked before no longer applies.
      set({ position: result.position, chosenCity: null, placeHint: null, status: 'found' });
    } else {
      set({ status: result.status });
    }
  },
  chooseCity: (slug) => set({ chosenCity: slug, placeHint: null }),
  setTypedPlace: (position, hint) =>
    set({ position, chosenCity: null, placeHint: hint ?? null, status: 'found' }),
}));
