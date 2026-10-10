import { renderHook } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import * as ReactNative from 'react-native';

import { palette, shadows, type ColorScheme } from '@/theme/colors';
import { navigationTheme } from '@/theme/navigation';
import { ColorSchemeContext, useShadows, useTheme } from '@/theme/use-theme';

/** Renders hooks inside the app's colour-scheme provider. */
function withScheme(scheme: ColorScheme) {
  return function SchemeWrapper({ children }: PropsWithChildren) {
    return <ColorSchemeContext.Provider value={scheme}>{children}</ColorSchemeContext.Provider>;
  };
}

describe('theme (D-021)', () => {
  test('is light by default, even when the system is in dark mode', () => {
    jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue('dark');
    const { result } = renderHook(() => useTheme());
    expect(result.current).toBe(palette.light);
  });

  test('follows the scheme the user picked', () => {
    const { result } = renderHook(() => ({ colors: useTheme(), elevation: useShadows() }), {
      wrapper: withScheme('dark'),
    });
    expect(result.current.colors).toBe(palette.dark);
    expect(result.current.elevation).toBe(shadows.dark);
  });

  test('dark and light define the same tokens', () => {
    expect(Object.keys(palette.dark).sort()).toEqual(Object.keys(palette.light).sort());
  });

  test('navigation theme uses the scheme colours and Inter', () => {
    const dark = navigationTheme('dark');
    expect(dark.dark).toBe(true);
    expect(dark.colors.background).toBe(palette.dark.background);
    expect(dark.colors.card).toBe(palette.dark.surface);
    expect(navigationTheme('light').colors.primary).toBe(palette.light.primary);
    expect(dark.fonts.bold.fontFamily).toBe('Inter_600SemiBold');
  });
});
