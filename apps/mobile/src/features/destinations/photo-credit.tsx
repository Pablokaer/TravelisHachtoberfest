// Credit over a cover photo (city cards, walk list cards): Commons images must be shown with
// their author and licence (docs/DATA_SOURCES.md).
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { PhotoCover } from './api';

import { Text } from '@/components/text';
import { radius, spacing } from '@/theme/colors';

/** Corner of the photo the credit sits in (bottom-left unless text already lives there). */
export type CreditPlacement = 'bottom-left' | 'top-left' | 'bottom-right';

/**
 * Author and licence pill in a corner of a photo; nothing when both are unknown.
 * The parent must be positioned (it is absolutely placed over the photo).
 * @example <View><Thumbnail uri={cover.url} style={s.photo} /><PhotoCredit cover={cover} /></View>
 */
export function PhotoCredit({
  cover,
  placement = 'bottom-left',
}: {
  cover: Pick<PhotoCover, 'author' | 'license'>;
  placement?: CreditPlacement;
}) {
  const { t } = useTranslation();
  if (!cover.author && !cover.license) return null;
  return (
    <View style={[styles.credit, styles[placement]]}>
      <Text variant="helper" numberOfLines={1} style={styles.creditText}>
        {t('home.photoCredit', { author: cover.author ?? '?', license: cover.license ?? '' })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Over the photo in both themes, so fixed light-on-dark colours rather than theme tokens.
  credit: {
    position: 'absolute',
    maxWidth: '80%',
    pointerEvents: 'none',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  'bottom-left': { left: spacing.sm, bottom: spacing.sm },
  'top-left': { left: spacing.sm, top: spacing.sm },
  'bottom-right': { right: spacing.sm, bottom: spacing.sm },
  creditText: { color: '#FFFFFF', fontSize: 11, lineHeight: 14 },
});
