import { render, screen } from '@testing-library/react-native';

import { BrandMark, BRAND_SYMBOL } from '@/components/app-menu';
import '@/lib/i18n';

describe('BrandMark', () => {
  test('shows the swallow symbol image at the requested size', () => {
    render(<BrandMark size={40} />);
    const symbol = screen.getByTestId('brand-symbol');
    expect(BRAND_SYMBOL).toBeDefined();
    expect(symbol).toHaveStyle({ width: 40, height: 40 });
  });

  test('adds the wordmark only when asked', () => {
    const { rerender } = render(<BrandMark />);
    expect(screen.queryByText('Travelist')).toBeNull();
    rerender(<BrandMark withName />);
    expect(screen.getByText('Travelist')).toBeTruthy();
  });
});
