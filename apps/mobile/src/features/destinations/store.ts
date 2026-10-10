import type { AttractionCategory } from '@wayfarer/shared';
import { create } from 'zustand';

/** Explore filters and view mode, kept while moving between cities (the city is in the URL). */
type ExploreState = {
  categories: AttractionCategory[];
  view: 'map' | 'list';
  /** Lowest average rating shown (3, 4 or 5 stars), or null for every place (D-032). */
  minRating: number | null;
  toggleCategory: (c: AttractionCategory) => void;
  clearCategories: () => void;
  setView: (view: 'map' | 'list') => void;
  setMinRating: (minRating: number | null) => void;
};

export const useExploreStore = create<ExploreState>((set) => ({
  categories: [],
  view: 'map',
  minRating: null,
  toggleCategory: (c) =>
    set((s) => ({
      categories: s.categories.includes(c)
        ? s.categories.filter((x) => x !== c)
        : [...s.categories, c],
    })),
  clearCategories: () => set({ categories: [] }),
  setView: (view) => set({ view }),
  setMinRating: (minRating) => set({ minRating }),
}));
