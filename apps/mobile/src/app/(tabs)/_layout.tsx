import { Redirect, router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { useStartChoice } from '@/features/start/choice-store';
import { useFeatures } from '@/lib/features';
import { spacing } from '@/theme/colors';
import { fontFamilyFor } from '@/theme/fonts';
import { useBreakpoint, useTheme } from '@/theme/use-theme';

/**
 * Desktop side rail: fits the English labels, "Future trips" included (D-081). Longer Portuguese
 * labels ("As minhas viagens") are ellipsised.
 */
const RAIL_WIDTH = 112;

function TabIcon({ name, color }: { name: IconName; color: string }) {
  return <Icon name={name} color={color} size={24} />;
}

export default function TabsLayout() {
  const { t } = useTranslation();
  const theme = useTheme();
  // Desktop gets a side rail instead of a phone-style bottom bar.
  const { isDesktop } = useBreakpoint();
  const insets = useSafeAreaInsets();
  const { localMode } = useFeatures();
  // A local install asks its first question before showing anything else (D-079).
  const answered = useStartChoice((state) => state.choice !== null);
  if (localMode && !answered) return <Redirect href="/start" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarPosition: isDesktop ? 'left' : 'bottom',
        tabBarVariant: isDesktop ? 'material' : 'uikit',
        // Label under the icon keeps the desktop rail narrow (side labels force a ~360px sidebar).
        tabBarLabelPosition: 'below-icon',
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarLabelStyle: { fontFamily: fontFamilyFor('500'), fontSize: 12, lineHeight: 16 },
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          ...(isDesktop
            ? // Top padding matches the page header's, so the first item lines up with the logo row.
              {
                borderRightWidth: StyleSheet.hairlineWidth,
                paddingTop: spacing.md,
                width: RAIL_WIDTH,
              }
            : {
                // Each item adds 5px padding around a 28px icon box; the default 49pt bar
                // leaves Inter's 16px labels about 9px and clips them.
                borderTopWidth: StyleSheet.hairlineWidth,
                height: 68 + insets.bottom,
                paddingTop: 6,
                paddingBottom: 6 + insets.bottom,
              }),
        },
        sceneStyle: { backgroundColor: theme.background },
      }}>
      <Tabs.Screen
        name="(explore)"
        // Pressing Explore while on it (e.g. on a city page) goes back to the Home; from another
        // tab it returns to where the user left off.
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            if (!navigation.isFocused()) return;
            e.preventDefault();
            router.navigate('/');
          },
        })}
        options={{
          title: localMode ? t('tabs.world') : t('tabs.explore'),
          tabBarIcon: ({ color }) => (
            <TabIcon name={localMode ? 'globe' : 'search'} color={String(color)} />
          ),
        }}
      />
      <Tabs.Screen
        name="suggested"
        options={{
          title: localMode ? t('tabs.myCity') : t('tabs.suggested'),
          tabBarIcon: ({ color }) => (
            <TabIcon name={localMode ? 'pin' : 'route'} color={String(color)} />
          ),
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          title: t('tabs.plan'),
          tabBarIcon: ({ color }) => <TabIcon name="sparkles" color={String(color)} />,
        }}
      />
      <Tabs.Screen
        name="future-trips"
        options={{
          title: t('tabs.futureTrips'),
          tabBarIcon: ({ color }) => <TabIcon name="bookmark" color={String(color)} />,
        }}
      />
      <Tabs.Screen
        name="trips"
        options={{
          title: t('tabs.trips'),
          tabBarIcon: ({ color }) => <TabIcon name="luggage" color={String(color)} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ color }) => <TabIcon name="person" color={String(color)} />,
        }}
      />
    </Tabs>
  );
}
