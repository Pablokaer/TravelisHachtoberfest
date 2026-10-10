import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { countryName, useCountries, type Country } from './api';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { Icon } from '@/components/icon';
import { Sheet } from '@/components/sheet';
import { ErrorState, LoadingState } from '@/components/states';
import { Tappable } from '@/components/tappable';
import { Text } from '@/components/text';
import { normalizeSearch } from '@/features/destinations/search';
import { flagEmoji } from '@/lib/format';
import { MIN_TOUCH, radius, spacing } from '@/theme/colors';
import { fontFamilyFor } from '@/theme/fonts';
import { useTheme } from '@/theme/use-theme';

type Props = {
  label: string;
  /** Selected ISO codes. */
  value: string[];
  onChange: (codes: string[]) => void;
  multiple?: boolean;
  max?: number;
  error?: string;
  testID?: string;
};

/** Searchable country selector (single or multiple) rendered as chips + a modal list. */
export function CountryPicker({ label, value, onChange, multiple, max = 5, error, testID }: Props) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const countries = useCountries();
  const lang = i18n.resolvedLanguage ?? 'en';

  const byCode = useMemo(
    () => new Map((countries.data ?? []).map((c) => [c.code, c] as const)),
    [countries.data],
  );
  const filtered = useMemo(() => {
    const q = normalizeSearch(query);
    const list = [...(countries.data ?? [])].sort((a, b) =>
      countryName(a, lang).localeCompare(countryName(b, lang), lang),
    );
    if (!q) return list;
    return list.filter(
      (c) =>
        normalizeSearch(c.name_en).includes(q) ||
        normalizeSearch(c.name_pt).includes(q) ||
        c.code.toLowerCase() === q,
    );
  }, [countries.data, query, lang]);

  const toggle = (c: Country) => {
    if (!multiple) {
      onChange([c.code]);
      setOpen(false);
      return;
    }
    if (value.includes(c.code)) onChange(value.filter((v) => v !== c.code));
    else if (value.length < max) onChange([...value, c.code]);
  };

  const message = error ? t(error as never, { defaultValue: error }) : undefined;

  return (
    <View style={{ gap: spacing.sm }} testID={testID}>
      <Text variant="label">{label}</Text>
      <View style={styles.chips}>
        {value.map((code) => (
          <Chip
            key={code}
            label={countryName(byCode.get(code), lang) || code}
            selected
            onRemove={
              multiple ? () => onChange(value.filter((v) => v !== code)) : () => setOpen(true)
            }
          />
        ))}
        {multiple || value.length === 0 ? (
          <Button
            compact
            variant="secondary"
            icon="add"
            label={value.length ? t('countryPicker.addAnother') : t('countryPicker.choose')}
            onPress={() => setOpen(true)}
            disabled={multiple && value.length >= max}
          />
        ) : null}
      </View>
      {message ? (
        <Text variant="helper" style={{ color: theme.danger }}>
          {message}
        </Text>
      ) : null}

      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title={label}
        action={
          <Button compact variant="ghost" label={t('common.done')} onPress={() => setOpen(false)} />
        }>
        <View
          style={[
            styles.search,
            { backgroundColor: theme.surfaceMuted, borderColor: theme.border },
          ]}>
          <Icon name="search" size={18} color={theme.textSecondary} />
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder={t('countryPicker.search')}
            accessibilityLabel={t('countryPicker.search')}
            placeholderTextColor={theme.textSecondary}
            style={[styles.searchInput, { color: theme.text }]}
          />
        </View>
        {countries.isPending ? (
          <LoadingState />
        ) : countries.isError ? (
          <ErrorState onRetry={() => countries.refetch()} />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(c) => c.code}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={30}
            renderItem={({ item }) => {
              const selected = value.includes(item.code);
              return (
                <Tappable
                  onPress={() => toggle(item)}
                  accessibilityRole={multiple ? 'checkbox' : 'radio'}
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={countryName(item, lang)}
                  pressScale={0.98}
                  style={({ hovered, pressed }) => [
                    styles.row,
                    {
                      backgroundColor: selected
                        ? theme.primarySoft
                        : hovered || pressed
                          ? theme.surfaceMuted
                          : 'transparent',
                    },
                  ]}>
                  <Text style={styles.flag}>{flagEmoji(item.code)}</Text>
                  <Text style={styles.flex}>{countryName(item, lang)}</Text>
                  {selected ? (
                    <Icon name="check" size={18} color={theme.primary} />
                  ) : (
                    <Text variant="helper" secondary>
                      {item.code}
                    </Text>
                  )}
                </Tappable>
              );
            }}
            ListEmptyComponent={
              <Text secondary style={{ padding: spacing.md, textAlign: 'center' }}>
                {t('countryPicker.noResults')}
              </Text>
            }
          />
        )}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH + 4,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, alignSelf: 'stretch', fontSize: 16, fontFamily: fontFamilyFor('400') },
  row: {
    minHeight: MIN_TOUCH + 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md - 4,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.md,
  },
  flag: { fontSize: 20, lineHeight: 26 },
});
