import type { PropsWithChildren, ReactNode } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconButton } from './button';
import { Text } from './text';

import { radius, spacing } from '@/theme/colors';
import { useBreakpoint, useShadows, useTheme } from '@/theme/use-theme';

type Props = PropsWithChildren<{
  visible: boolean;
  onClose: () => void;
  title: string;
  /** Replaces the default close button on the right (e.g. a "Done" button). */
  action?: ReactNode;
}>;

/**
 * Modal surface: a page sheet on phones, a centred dialog over a dimmed backdrop on tablets
 * and desktop.
 */
export function Sheet({ visible, onClose, title, action, children }: Props) {
  const theme = useTheme();
  const shadows = useShadows();
  const { t } = useTranslation();
  const { isTablet } = useBreakpoint();

  const header = (
    <View style={[styles.header, { borderColor: theme.border }]}>
      <IconButton icon="close" accessibilityLabel={t('common.close')} onPress={onClose} />
      <Text variant="subtitle" style={styles.title} numberOfLines={1} accessibilityRole="header">
        {title}
      </Text>
      <View style={styles.action}>{action}</View>
    </View>
  );

  if (isTablet) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.backdropWrap}>
          <Pressable
            style={[StyleSheet.absoluteFill, { backgroundColor: theme.overlay }]}
            onPress={onClose}
            accessibilityLabel={t('common.close')}
          />
          <View
            style={[styles.dialog, { backgroundColor: theme.surface, boxShadow: shadows.raised }]}>
            {header}
            <View style={styles.body}>{children}</View>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}
      onRequestClose={onClose}>
      <SafeAreaView
        edges={Platform.OS === 'ios' ? ['bottom'] : ['top', 'bottom']}
        style={[styles.page, { backgroundColor: theme.surface }]}>
        {header}
        <View style={styles.body}>{children}</View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md - 4,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  title: { flex: 1, textAlign: 'center' },
  // Same width as the close button so the title stays centred.
  action: { minWidth: 40, alignItems: 'flex-end' },
  backdropWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  dialog: {
    width: '100%',
    maxWidth: 560,
    height: '80%',
    maxHeight: 720,
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  page: { flex: 1 },
  body: { flex: 1, padding: spacing.md, gap: spacing.md },
});
