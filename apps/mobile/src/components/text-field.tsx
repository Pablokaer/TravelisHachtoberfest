import { forwardRef, useState } from 'react';
import {
  Platform,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { Icon, type IconName } from './icon';
import { Text } from './text';

import { MIN_TOUCH, radius, spacing } from '@/theme/colors';
import { fontFamilyFor } from '@/theme/fonts';
import { useTheme } from '@/theme/use-theme';

type Props = TextInputProps & {
  label: string;
  /** i18n key or plain message */
  error?: string;
  hint?: string;
  icon?: IconName;
  /** Style of the label above the box (e.g. centred in the review form on phones, D-076). */
  labelStyle?: StyleProp<TextStyle>;
};

export const TextField = forwardRef<TextInput, Props>(function TextField(
  { label, error, hint, icon, style, labelStyle, onFocus, onBlur, ...rest },
  ref,
) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [focused, setFocused] = useState(false);
  const message = error ? t(error as never, { defaultValue: error }) : undefined;
  const borderColor = message ? theme.danger : focused ? theme.text : theme.borderStrong;
  return (
    <View style={styles.wrap}>
      <Text variant="label" style={labelStyle}>
        {label}
      </Text>
      <View
        style={[
          styles.box,
          { backgroundColor: theme.surface, borderColor },
          (focused || message) && styles.boxActive,
        ]}>
        {icon ? <Icon name={icon} size={18} color={theme.textSecondary} /> : null}
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          accessibilityHint={hint}
          placeholderTextColor={theme.textSecondary}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, noWebOutline, { color: theme.text }, style]}
          {...rest}
        />
      </View>
      {message ? (
        <View style={styles.message}>
          <Icon name="error" size={14} color={theme.danger} />
          <Text
            variant="helper"
            style={{ color: theme.danger, flex: 1 }}
            accessibilityLiveRegion="polite">
            {message}
          </Text>
        </View>
      ) : hint ? (
        <Text variant="helper" secondary>
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

// The wrapper draws the focus border, so drop the browser's own input outline.
const noWebOutline =
  Platform.OS === 'web' ? ({ outlineStyle: 'none' } as unknown as TextStyle) : null;

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm - 2 },
  box: {
    minHeight: MIN_TOUCH + 8,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  // Thicker border on focus/error without shifting the layout.
  boxActive: { borderWidth: 2, paddingHorizontal: spacing.md - 1 },
  input: { flex: 1, alignSelf: 'stretch', fontSize: 16, fontFamily: fontFamilyFor('400') },
  message: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
