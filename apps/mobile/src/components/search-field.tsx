import { useState } from 'react';
import {
  Platform,
  StyleSheet,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
  type TextStyle,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { IconButton } from './button';
import { Icon } from './icon';

import { MIN_TOUCH, radius, spacing } from '@/theme/colors';
import { fontFamilyFor } from '@/theme/fonts';
import { useTheme } from '@/theme/use-theme';

/** Height of the field; dropdowns anchored under it add their own gap. */
export const SEARCH_FIELD_HEIGHT = MIN_TOUCH + 4;

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  /** Placeholder, also the accessible label. */
  label: string;
  testID?: string;
  /** Dark border; defaults to "while focused" (a dropdown owner can keep it on while open). */
  highlighted?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  onKeyPress?: (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => void;
};

/**
 * Pill-shaped search input with a search glyph and a clear button, shared by the city search
 * (Home) and the attraction search (city page).
 * @example <SearchField value={q} onChangeText={setQ} label={t('explore.searchCities')} />
 */
export function SearchField(props: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const highlighted = props.highlighted ?? focused;
  return (
    <View
      style={[
        styles.field,
        {
          backgroundColor: theme.surfaceMuted,
          borderColor: highlighted ? theme.text : theme.border,
        },
      ]}>
      <Icon name="search" size={18} color={theme.textSecondary} />
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        onFocus={() => {
          setFocused(true);
          props.onFocus?.();
        }}
        onBlur={() => {
          setFocused(false);
          props.onBlur?.();
        }}
        onKeyPress={props.onKeyPress}
        placeholder={props.label}
        accessibilityLabel={props.label}
        placeholderTextColor={theme.textSecondary}
        returnKeyType="search"
        autoCorrect={false}
        testID={props.testID}
        style={[styles.input, noWebOutline, { color: theme.text }]}
      />
      {props.value ? (
        <IconButton
          icon="close"
          size={14}
          accessibilityLabel={t('explore.clearSearch')}
          onPress={() => props.onChangeText('')}
          style={styles.clear}
        />
      ) : null}
    </View>
  );
}

// The field draws its own focus border, so drop the browser's input outline.
const noWebOutline =
  Platform.OS === 'web' ? ({ outlineStyle: 'none' } as unknown as TextStyle) : null;

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: SEARCH_FIELD_HEIGHT,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  input: { flex: 1, alignSelf: 'stretch', fontSize: 16, fontFamily: fontFamilyFor('400') },
  clear: { width: 32, height: 32 },
});
