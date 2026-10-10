import { Stack } from 'expo-router';

import { useTheme } from '@/theme/use-theme';

/**
 * The Explore tab: the Home (destinations) with city pages stacked on top, so the tab bar and
 * side rail stay visible, back returns to the Home, and pressing the tab again pops to it.
 */
export default function ExploreLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerTitleAlign: 'center',
        contentStyle: { backgroundColor: theme.background },
      }}
    />
  );
}
