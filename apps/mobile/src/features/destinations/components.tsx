import { ATTRACTION_CATEGORIES, type AttractionCategory } from '@wayfarer/shared';
import { useState, type ReactNode } from 'react';
import { FlatList, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { localizedName, type AttractionSummary, type City } from './api';
import { normalizeSearch } from './search';
import { Thumbnail } from './thumbnail';

import { Icon, categoryIcon } from '@/components/icon';
import { Sheet } from '@/components/sheet';
import { Tappable } from '@/components/tappable';
import { Text } from '@/components/text';
import { flagEmoji } from '@/lib/format';
import { categoryColors, MIN_TOUCH, radius, spacing } from '@/theme/colors';
import { fontFamilyFor } from '@/theme/fonts';
import { useShadows, useTheme } from '@/theme/use-theme';

/** Side of a list row's photo, in points. */
const ROW_PHOTO_SIZE = 64;

/** Search-style pill showing the current city; opens the city picker. */
export function CitySwitcher({
  cities,
  current,
  onSelect,
}: {
  cities: City[];
  current: City | undefined;
  onSelect: (slug: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const shadows = useShadows();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const lang = i18n.resolvedLanguage ?? 'en';
  const name = (c: City) => (lang === 'pt' ? c.namePt : c.nameEn);

  const q = normalizeSearch(query);
  const filtered = [...cities]
    .sort((a, b) => name(a).localeCompare(name(b), lang))
    .filter(
      (c) => !q || normalizeSearch(c.nameEn).includes(q) || normalizeSearch(c.namePt).includes(q),
    );

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  return (
    <>
      <Tappable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t('explore.changeCity', { city: current ? name(current) : '' })}
        testID="city-switcher"
        pressScale={0.98}
        style={({ hovered }) => [
          styles.pill,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border,
            boxShadow: hovered ? shadows.raised : shadows.card,
          },
        ]}>
        <View style={[styles.pillIcon, { backgroundColor: theme.primary }]}>
          <Icon name="search" size={16} color={theme.onPrimary} />
        </View>
        <Text variant="subtitle" numberOfLines={1} style={styles.flex}>
          {current
            ? `${flagEmoji(current.countryCode)}  ${name(current)}`
            : t('explore.chooseCity')}
        </Text>
        <Icon name="chevronDown" size={16} color={theme.textSecondary} />
      </Tappable>

      <Sheet visible={open} onClose={close} title={t('explore.chooseCity')}>
        <View
          style={[
            styles.search,
            { backgroundColor: theme.surfaceMuted, borderColor: theme.border },
          ]}>
          <Icon name="search" size={18} color={theme.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('explore.searchCities')}
            accessibilityLabel={t('explore.searchCities')}
            placeholderTextColor={theme.textSecondary}
            style={[styles.searchInput, { color: theme.text }]}
          />
        </View>
        <FlatList
          data={filtered}
          keyExtractor={(c) => c.slug}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text secondary style={styles.empty}>
              {t('explore.noCityMatch')}
            </Text>
          }
          renderItem={({ item }) => {
            const selected = item.slug === current?.slug;
            return (
              <Tappable
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={name(item)}
                pressScale={0.98}
                onPress={() => {
                  onSelect(item.slug);
                  close();
                }}
                style={({ hovered, pressed }) => [
                  styles.cityRow,
                  {
                    backgroundColor: selected
                      ? theme.primarySoft
                      : hovered || pressed
                        ? theme.surfaceMuted
                        : 'transparent',
                  },
                ]}>
                <View style={[styles.flag, { backgroundColor: theme.surfaceMuted }]}>
                  <Text style={styles.flagText}>{flagEmoji(item.countryCode)}</Text>
                </View>
                <View style={styles.flex}>
                  <Text variant="subtitle">{name(item)}</Text>
                  <Text variant="caption" secondary>
                    {t('explore.placesCount', { count: item.attractionCount })}
                  </Text>
                </View>
                {selected ? <Icon name="check" size={18} color={theme.primary} /> : null}
              </Tappable>
            );
          }}
        />
      </Sheet>
    </>
  );
}

/**
 * Icon + label category tabs; the active ones are underlined in the text colour. The tabs form
 * one centred group when they fit; otherwise they scroll edge to edge, starting at `inset`.
 * `trailing` (the rating tabs) scrolls in the same row, after the categories.
 */
export function CategoryFilters({
  selected,
  onToggle,
  onClear,
  inset = 0,
  trailing,
}: {
  selected: AttractionCategory[];
  onToggle: (c: AttractionCategory) => void;
  onClear: () => void;
  /** Horizontal padding of the scrolling row (the page gutter). */
  inset?: number;
  trailing?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.filters, { paddingHorizontal: inset }]}
      accessibilityLabel={t('explore.filters')}>
      <FilterTab
        label={t('explore.allCategories')}
        icon={(color) => <Icon name="grid" size={20} color={color} />}
        selected={selected.length === 0}
        onPress={onClear}
      />
      {ATTRACTION_CATEGORIES.map((c) => (
        <FilterTab
          key={c}
          label={t(`category.${c}`)}
          icon={(color) => <Icon name={categoryIcon(c)} size={20} color={color} />}
          selected={selected.includes(c)}
          onPress={() => onToggle(c)}
        />
      ))}
      {trailing}
    </ScrollView>
  );
}

/**
 * One tab of the city page filter row: an icon over a label, underlined in the text colour
 * while active. Categories are checkboxes; the rating tabs are radios.
 * @example <FilterTab label="Parks" icon={(c) => <Icon name="tree" color={c} />} selected onPress={…} />
 */
export function FilterTab({
  label,
  accessibilityLabel = label,
  role = 'checkbox',
  icon,
  selected,
  onPress,
}: {
  label: string;
  accessibilityLabel?: string;
  role?: 'checkbox' | 'radio';
  /** Draws the icon in the tab's current text colour. */
  icon: (color: string) => ReactNode;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Tappable
      onPress={onPress}
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: selected }}
      pressScale={0.94}
      style={styles.tab}>
      {({ hovered }) => {
        const color = selected || hovered ? theme.text : theme.textSecondary;
        return (
          <>
            {icon(color)}
            <Text variant="helper" style={{ color, fontWeight: selected ? '600' : '500' }}>
              {label}
            </Text>
            <View
              style={[
                styles.tabBar,
                {
                  backgroundColor: selected
                    ? theme.text
                    : hovered
                      ? theme.borderStrong
                      : 'transparent',
                },
              ]}
            />
          </>
        );
      }}
    </Tappable>
  );
}

export function CategoryDot({ category }: { category: string }) {
  return (
    <View
      style={[styles.dot, { backgroundColor: categoryColors[category] ?? categoryColors.other }]}
    />
  );
}

/** Compact row for ordered lists (route stops, trip stops). */
export function AttractionRow({
  item,
  onPress,
  trailing,
  index,
  badgeColor,
}: {
  item: AttractionSummary;
  onPress?: () => void;
  trailing?: React.ReactNode;
  index?: number;
  /** Colour of the position badge; split routes each have their own (default: accent). */
  badgeColor?: string;
}) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const shadows = useShadows();
  const name = localizedName(item, i18n.resolvedLanguage ?? 'en');
  return (
    <Tappable
      onPress={onPress}
      disabled={!onPress}
      pressScale={0.99}
      // Only a button when it opens something: route rows hold their own reorder buttons,
      // and a <button> inside a <button> is invalid HTML on web.
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${index != null ? `${index + 1}. ` : ''}${name}, ${t(`category.${item.category}`)}`}
      style={({ hovered }) => [
        styles.row,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          boxShadow: hovered ? shadows.raised : shadows.card,
        },
      ]}>
      <View>
        <Thumbnail
          uri={item.imageUrl}
          width={ROW_PHOTO_SIZE}
          style={styles.thumb}
          testID="attraction-row-photo"
        />
        {index != null ? (
          <View
            style={[
              styles.rowBadge,
              { backgroundColor: badgeColor ?? theme.primary, borderColor: theme.surface },
            ]}>
            <Text variant="helper" style={{ color: theme.onPrimary, fontWeight: '700' }}>
              {index + 1}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.rowText}>
        <Text variant="subtitle" numberOfLines={2}>
          {name}
        </Text>
        <View style={styles.meta}>
          <CategoryDot category={item.category} />
          <Text variant="caption" secondary numberOfLines={1} style={styles.flex}>
            {t(`category.${item.category}`)} ·{' '}
            {t('attraction.visitMinutes', { minutes: item.avgVisitMinutes })}
            {item.isUnesco ? ' · UNESCO' : ''}
          </Text>
        </View>
      </View>
      {trailing}
    </Tappable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md - 4,
    paddingLeft: spacing.sm,
    paddingRight: spacing.md,
    minHeight: MIN_TOUCH + 4,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pillIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  empty: { padding: spacing.md, textAlign: 'center' },
  cityRow: {
    minHeight: MIN_TOUCH + 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  flag: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flagText: { fontSize: 22, lineHeight: 28 },
  // flexGrow + center: a centred group when the tabs fit, a start-aligned scroll when not.
  filters: { flexGrow: 1, justifyContent: 'center', gap: spacing.md },
  tab: { alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.xs, minWidth: 56 },
  // The underline sits on the header's bottom border.
  tabBar: { height: 2, alignSelf: 'stretch', borderRadius: 1, marginTop: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm - 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm + 2,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  thumb: { width: ROW_PHOTO_SIZE, height: ROW_PHOTO_SIZE, borderRadius: radius.md },
  rowBadge: {
    position: 'absolute',
    top: -6,
    left: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, gap: spacing.xxs },
});
