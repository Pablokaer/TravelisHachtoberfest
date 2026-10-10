import { render, screen } from '@testing-library/react-native';
import { ATTRACTION_CATEGORIES } from '@wayfarer/shared';

import { categoryIcon } from '@/components/icon';
import { CategoryFilters } from '@/features/destinations/components';
import { categoryColors } from '@/theme/colors';
import '@/lib/i18n';

describe('CategoryFilters', () => {
  test('offers a Nature tab right after Parks (D-068)', () => {
    render(<CategoryFilters selected={['nature']} onToggle={jest.fn()} onClear={jest.fn()} />);
    const tabs = screen.getAllByRole('checkbox').map((tab) => tab.props.accessibilityLabel);
    expect(tabs.slice(tabs.indexOf('Parks'), tabs.indexOf('Parks') + 3)).toEqual([
      'Parks',
      'Nature',
      'Palaces',
    ]);
    expect(screen.getByRole('checkbox', { name: 'Nature' })).toBeChecked();
  });
});

describe('category styling', () => {
  test('every category has its own icon and its own map marker colour', () => {
    for (const category of ATTRACTION_CATEGORIES) expect(categoryIcon(category)).toBe(category);
    const colors = ATTRACTION_CATEGORIES.map((category) => categoryColors[category]);
    expect(colors.every(Boolean)).toBe(true);
    expect(new Set(colors).size).toBe(colors.length);
  });
});
