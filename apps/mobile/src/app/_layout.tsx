import '@/lib/i18n';

import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { DEFAULT_THEME } from '@wayfarer/shared';
import { Stack, ThemeProvider, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Appearance, Platform, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppMenuButton } from '@/components/app-menu';
import { LoadingState } from '@/components/states';
import { AuthProvider, useAuth } from '@/features/auth/auth-provider';
import { useWelcomeEmail } from '@/features/auth/welcome-email';
import { useProfile } from '@/features/profile/api';
import { UpgradeButton } from '@/features/subscription/upgrade-button';
import { useFeatures } from '@/lib/features';
import { createQueryClient } from '@/lib/query-client';
import { fontAssets, fontFamilyFor } from '@/theme/fonts';
import { navigationTheme } from '@/theme/navigation';
import { ColorSchemeContext, useTheme } from '@/theme/use-theme';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

const RESET_PASSWORD_PATH = '/auth/reset-password';

function RootNavigator() {
  const { t, i18n } = useTranslation();
  const { session, isLoading } = useAuth();
  const profile = useProfile();
  const theme = useTheme();
  const signedIn = !!session;
  const onboarded = !!profile.data?.onboardedAt;
  // Local mode (D-078) opens the app without sign-in, so the screens need no account.
  const { localMode } = useFeatures();
  const canEnter = localMode || (signedIn && onboarded);

  useWelcomeEmail(signedIn ? profile.data : undefined);

  // The profile's language wins over the device language once known.
  const profileLanguage = profile.data?.language;
  useEffect(() => {
    if (profileLanguage && i18n.resolvedLanguage !== profileLanguage)
      void i18n.changeLanguage(profileLanguage);
  }, [profileLanguage, i18n]);

  // The reset link signs the user in on the reset page itself (D-066). Swapping the navigator for
  // the loading state there would remount it on the app's first screen, skipping the new password.
  const onResetPage = usePathname() === RESET_PASSWORD_PATH;
  if (isLoading || (signedIn && profile.isPending && !onResetPage)) return <LoadingState />;

  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerTitleAlign: 'center',
        headerTintColor: theme.text,
        headerBackButtonDisplayMode: 'minimal',
        headerTitleStyle: { fontFamily: fontFamilyFor('600'), fontSize: 16 },
        contentStyle: { backgroundColor: theme.background },
        // Logo + menu on every stacked screen, so a deep link (e.g. /trip/…) is never a dead end.
        // "Upgrade" (free plan, D-047) beside the menu on every stacked screen.
        headerRight: canEnter ? () => <HeaderActions /> : undefined,
      }}>
      <Stack.Protected guard={canEnter}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="attraction/[id]" options={{ title: '', presentation: 'modal' }} />
        <Stack.Screen
          name="checklist/[city]"
          options={{ title: t('checklist.title'), presentation: 'modal' }}
        />
        <Stack.Screen name="route" options={{ title: t('route.title') }} />
        {/* The first question of a local install (D-079). */}
        <Stack.Screen name="start" options={{ headerShown: false }} />
        <Stack.Screen name="trip/[id]" options={{ title: t('trips.detailTitle') }} />
        <Stack.Screen name="edit-profile" options={{ title: t('profile.edit') }} />
        {/* Free and Premium (D-047). */}
        <Stack.Screen name="plans" options={{ title: t('plans.title') }} />
        {/* A walk list's group chat (D-043): /walk-chat?id=…, members only. */}
        <Stack.Screen name="walk-chat" options={{ title: t('chat.title') }} />
        {/* A traveller's public profile (D-045): /traveller?id=<public id>. */}
        <Stack.Screen name="traveller" options={{ title: t('traveller.title') }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !onboarded && !localMode}>
        <Stack.Screen
          name="onboarding"
          options={{ title: t('onboarding.title'), headerBackVisible: false }}
        />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn && !localMode}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
      {/* Password reset link (D-066): reachable signed in or out, so the session the link creates
          lands here to set the password instead of being sent into the app. */}
      <Stack.Screen name="auth/reset-password" options={{ headerShown: false }} />
      {/* Shared walk lists open for anyone with the link, signed in or not (D-031). */}
      <Stack.Screen name="shared" options={{ title: t('sharing.sharedTitle') }} />
      <Stack.Screen name="about" options={{ title: t('about.title') }} />
    </Stack>
  );
}

/** The right side of stacked screens' headers: "Upgrade" (free plan) and the app menu. */
function HeaderActions() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <UpgradeButton />
      <AppMenuButton />
    </View>
  );
}

/** Applies the profile's theme (D-021) to our tokens, navigation and native UI. */
function ThemedApp() {
  const profile = useProfile();
  const scheme = profile.data?.theme ?? DEFAULT_THEME;
  useEffect(() => {
    // Keyboards, alerts and pickers follow the app's choice, not the system's (native only).
    if (Platform.OS !== 'web') Appearance.setColorScheme(scheme);
  }, [scheme]);

  return (
    <ColorSchemeContext.Provider value={scheme}>
      <ThemeProvider value={navigationTheme(scheme)}>
        <RootNavigator />
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      </ThemeProvider>
    </ColorSchemeContext.Provider>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(createQueryClient);
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const ready = fontsLoaded || !!fontError;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);
  // Hold the splash screen until Inter is available, so text never reflows.
  if (!ready) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemedApp />
      </AuthProvider>
    </QueryClientProvider>
  );
}
