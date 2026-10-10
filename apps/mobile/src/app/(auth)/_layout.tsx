import { Stack } from 'expo-router';
import { Platform } from 'react-native';

import { signedOutHome } from '@/features/landing/signed-out-home';

// The landing page on the web, sign-in in the native apps (D-072).
export const unstable_settings = { initialRouteName: signedOutHome(Platform.OS) };

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
