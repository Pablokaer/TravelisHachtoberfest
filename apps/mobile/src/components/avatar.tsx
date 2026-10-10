import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Text } from './text';

import { initials } from '@/lib/format';
import { useTheme } from '@/theme/use-theme';

/**
 * Round avatar: the profile photo when there is one (D-039), otherwise up to two initials in
 * inverted colours (profile, review authors).
 * @example <Avatar name="Ana Traveller" uri={avatarUrl(profile.avatarPath)} size={40} /> // photo, or "AT"
 */
export function Avatar({
  name,
  uri,
  size = 64,
}: {
  name: string;
  uri?: string | null;
  size?: number;
}) {
  const theme = useTheme();
  const round = { width: size, height: size, borderRadius: size / 2 };
  if (uri) {
    return (
      <Image
        source={uri}
        style={[round, { backgroundColor: theme.surfaceMuted }]}
        contentFit="cover"
        accessible={false}
        transition={150}
        testID="avatar-photo"
      />
    );
  }
  return (
    <View aria-hidden style={[styles.avatar, round, { backgroundColor: theme.text }]}>
      <Text variant={size >= 56 ? 'title' : 'label'} style={{ color: theme.background }}>
        {initials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center' },
});
