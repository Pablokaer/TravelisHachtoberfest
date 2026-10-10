import { router } from 'expo-router';
import type { ComponentProps } from 'react';

import { Text } from '@/components/text';
import { travellerHref } from '@/features/profile/public-profile-api';
import { useTheme } from '@/theme/use-theme';

type Props = {
  name: string;
  /** The author's public id; without one the name is plain text. */
  publicId: string | null;
  variant?: ComponentProps<typeof Text>['variant'];
  secondary?: boolean;
};

/**
 * An author's name that opens their public profile (D-045), in reviews and chat messages.
 * @example <AuthorName name="Ana" publicId={review.authorPublicId} variant="subtitle" />
 */
export function AuthorName({ name, publicId, variant, secondary }: Props) {
  const theme = useTheme();
  if (!publicId)
    return (
      <Text variant={variant} secondary={secondary} numberOfLines={1}>
        {name}
      </Text>
    );
  return (
    <Text
      variant={variant}
      numberOfLines={1}
      accessibilityRole="link"
      accessibilityLabel={name}
      onPress={() => router.push(travellerHref(publicId))}
      style={{ color: theme.primary, textDecorationLine: 'underline' }}>
      {name}
    </Text>
  );
}
