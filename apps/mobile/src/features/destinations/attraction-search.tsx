import { useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { localizedName, type AttractionSummary } from './api';
import { buildSearchIndex, searchIndex } from './search';
import { Thumbnail } from './thumbnail';

import { IconButton } from '@/components/button';
import { SEARCH_FIELD_HEIGHT, SearchField } from '@/components/search-field';
import { Tappable } from '@/components/tappable';
import { Text } from '@/components/text';
import { radius, spacing } from '@/theme/colors';
import { useShadows, useTheme } from '@/theme/use-theme';

/** Suggestions shown in the dropdown; the grid below shows every match. */
const MAX_SUGGESTIONS = 8;
/** Side of a suggestion's photo, in points. */
const SUGGESTION_PHOTO_SIZE = 40;
// Lets a tap on a suggestion land before the input's blur closes the dropdown.
const BLUR_CLOSE_DELAY_MS = 180;

type Props = {
  items: readonly AttractionSummary[];
  cityName: string;
  query: string;
  onQueryChange: (query: string) => void;
  /** Stop number of each attraction already in the route. */
  routeOrder: ReadonlyMap<string, number>;
  onToggle: (item: AttractionSummary) => void;
  onOpen: (item: AttractionSummary) => void;
};

/**
 * Search field with autocomplete over the city's attractions. Picking a suggestion adds it to
 * the route (or removes it), like the card checkbox; the arrow opens the attraction. On web,
 * ↑/↓ move through suggestions, Enter picks, Escape closes.
 */
export function AttractionSearch(props: Props) {
  const { items, cityName, query, onQueryChange, routeOrder, onToggle, onOpen } = props;
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const shadows = useShadows();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const language = i18n.resolvedLanguage ?? 'en';
  // Names are normalised once per list of places, not on every keystroke.
  const index = useMemo(() => buildSearchIndex(items), [items]);
  // Only when the places, the text or the language change: the city page re-renders this on
  // every selection and route change too. The live query, so suggestions keep up with typing.
  const suggestions = useMemo(
    () => searchIndex(index, query, language, MAX_SUGGESTIONS),
    [index, query, language],
  );
  const showDropdown = open && query.trim().length > 0;

  const change = (text: string) => {
    onQueryChange(text);
    setActive(0);
    setOpen(true);
  };
  const onKeyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    const key = e.nativeEvent.key;
    if (key === 'Escape') return setOpen(false);
    if (!suggestions.length) return;
    if (key === 'ArrowDown') setActive((i) => (i + 1) % suggestions.length);
    if (key === 'ArrowUp') setActive((i) => (i - 1 + suggestions.length) % suggestions.length);
    if (key === 'Enter') onToggle(suggestions[Math.min(active, suggestions.length - 1)]!);
  };

  return (
    <View style={styles.wrap}>
      <SearchField
        value={query}
        onChangeText={change}
        label={t('explore.searchPlaceholder', { city: cityName })}
        testID="attraction-search"
        highlighted={open}
        onFocus={() => {
          if (blurTimer.current) clearTimeout(blurTimer.current);
          setOpen(true);
        }}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), BLUR_CLOSE_DELAY_MS);
        }}
        onKeyPress={onKeyPress}
      />

      {showDropdown ? (
        <View
          accessibilityRole="list"
          style={[
            styles.dropdown,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              boxShadow: shadows.raised,
            },
          ]}>
          {suggestions.length === 0 ? (
            <Text secondary style={styles.empty}>
              {t('explore.noMatches', { query: query.trim() })}
            </Text>
          ) : (
            suggestions.map((item, i) => (
              <Suggestion
                key={item.id}
                item={item}
                order={routeOrder.get(item.id)}
                active={i === active}
                onToggle={() => onToggle(item)}
                onOpen={() => onOpen(item)}
              />
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}

function Suggestion({
  item,
  order,
  active,
  onToggle,
  onOpen,
}: {
  item: AttractionSummary;
  order?: number;
  active: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const name = localizedName(item, i18n.resolvedLanguage ?? 'en');
  const checked = order != null;
  return (
    <View style={[styles.row, active && { backgroundColor: theme.surfaceMuted }]}>
      <Tappable
        accessibilityRole="checkbox"
        accessibilityLabel={t('route.includeNamed', { name })}
        accessibilityState={{ checked }}
        onPress={onToggle}
        pressScale={0.99}
        testID="search-suggestion"
        style={({ hovered }) => [
          styles.pick,
          hovered && !active && { backgroundColor: theme.surfaceMuted },
        ]}>
        <Thumbnail
          uri={item.imageUrl}
          width={SUGGESTION_PHOTO_SIZE}
          style={styles.thumb}
          iconSize={16}
          testID="search-suggestion-photo"
        />
        <View style={styles.text}>
          <Text variant="subtitle" numberOfLines={1}>
            {name}
          </Text>
          <Text variant="helper" secondary numberOfLines={1}>
            {t(`category.${item.category}`)} ·{' '}
            {t('attraction.visitMinutes', { minutes: item.avgVisitMinutes })}
          </Text>
        </View>
        <View
          style={[
            styles.check,
            checked
              ? { backgroundColor: theme.primary, borderColor: theme.primary }
              : { borderColor: theme.borderStrong },
          ]}>
          {checked ? (
            <Text variant="helper" style={{ color: theme.onPrimary, fontWeight: '700' }}>
              {order}
            </Text>
          ) : null}
        </View>
      </Tappable>
      <IconButton
        icon="chevronRight"
        size={16}
        accessibilityLabel={t('explore.openNamed', { name })}
        onPress={onOpen}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { zIndex: 10 },
  dropdown: {
    position: 'absolute',
    top: SEARCH_FIELD_HEIGHT + spacing.sm,
    left: 0,
    right: 0,
    paddingVertical: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  empty: { padding: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', paddingRight: spacing.xs },
  pick: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md - 4,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md - 4,
    borderRadius: radius.md,
  },
  thumb: { width: SUGGESTION_PHOTO_SIZE, height: SUGGESTION_PHOTO_SIZE, borderRadius: radius.sm },
  text: { flex: 1, gap: spacing.xxs },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
