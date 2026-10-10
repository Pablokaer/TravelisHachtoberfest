import type { AttractionCategory } from '@wayfarer/shared';
import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { City } from './api';
import { BrowseHeader } from './browse-header';
import { CategoryFilters, CitySwitcher } from './components';

import { Button, IconButton } from '@/components/button';
import { UpgradeButton } from '@/features/subscription/upgrade-button';
import { RatingFilterTabs } from '@/features/reviews/rating-filter-tabs';
import { useBreakpoint } from '@/theme/use-theme';

type Props = {
  cities: City[];
  city: City;
  onSelectCity: (slug: string) => void;
  /** The attraction search field (owns its query and dropdown). */
  search: ReactNode;
  categories: AttractionCategory[];
  onToggleCategory: (c: AttractionCategory) => void;
  onClearCategories: () => void;
  minRating: number | null;
  onChangeMinRating: (minRating: number | null) => void;
  onOpenChecklist: () => void;
  /** Page container (max width + gutter) shared with the grid below. */
  container: ViewStyle;
  gutter: number;
};

/**
 * City page header: [logo] [city pill + place search] [Before you go], then the category and
 * rating tabs.
 * @example <CityHeader city={amsterdam} search={<AttractionSearch … />} {...handlers} />
 */
export function CityHeader(props: Props) {
  const { isTablet } = useBreakpoint();
  return (
    <BrowseHeader
      container={props.container}
      gutter={props.gutter}
      lead={
        <CitySwitcher cities={props.cities} current={props.city} onSelect={props.onSelectCity} />
      }
      search={props.search}
      action={
        <View style={styles.actions}>
          <UpgradeButton />
          <ChecklistAction compact={!isTablet} onPress={props.onOpenChecklist} />
        </View>
      }>
      <CategoryFilters
        selected={props.categories}
        onToggle={props.onToggleCategory}
        onClear={props.onClearCategories}
        inset={props.gutter}
        trailing={<RatingFilterTabs value={props.minRating} onChange={props.onChangeMinRating} />}
      />
    </BrowseHeader>
  );
}

function ChecklistAction({ compact, onPress }: { compact: boolean; onPress: () => void }) {
  const { t } = useTranslation();
  return compact ? (
    <IconButton
      icon="checklist"
      variant="outlined"
      accessibilityLabel={t('checklist.open')}
      onPress={onPress}
      testID="open-checklist"
    />
  ) : (
    <Button
      compact
      variant="secondary"
      icon="checklist"
      label={t('checklist.open')}
      onPress={onPress}
      testID="open-checklist"
    />
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
