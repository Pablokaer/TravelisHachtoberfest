// The day's budget (D-088): slide the number of meals and of drinks, pick the kind, and see what
// that day costs in this city. A calculator over the city's estimated prices; nothing is saved.
import { clampCount, dailyCost, MAX_DRINKS, MAX_MEALS } from '@wayfarer/shared';
import type { DrinkKind, MealStyle } from '@wayfarer/shared';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { Text } from '@/components/text';
import { formatMoney } from '@/lib/format';
import { spacing } from '@/theme/colors';
import type { CityPriceEstimate } from './api';
import { StepSlider } from './step-slider';

const MEAL_STYLES: MealStyle[] = ['budget', 'restaurant', 'local'];
const DRINK_KINDS: DrinkKind[] = ['beer', 'softDrink', 'cocktail', 'coffee'];
/** A day most visitors recognise: three meals and two drinks. */
const DEFAULT_MEALS = 3;
const DEFAULT_DRINKS = 2;

function Choices<T extends string>({
  options,
  value,
  label,
  onChange,
}: {
  options: T[];
  value: T;
  label: (option: T) => string;
  onChange: (option: T) => void;
}) {
  return (
    <View style={styles.chips}>
      {options.map((option) => (
        <Chip
          key={option}
          label={label(option)}
          selected={option === value}
          onPress={() => onChange(option)}
        />
      ))}
    </View>
  );
}

/**
 * @example <BudgetCard estimate={estimate} />
 */
export function BudgetCard({ estimate }: { estimate: CityPriceEstimate }) {
  const { t, i18n } = useTranslation();
  const [meals, setMeals] = useState(DEFAULT_MEALS);
  const [drinks, setDrinks] = useState(DEFAULT_DRINKS);
  const [mealStyle, setMealStyle] = useState<MealStyle>('budget');
  const [drinkKind, setDrinkKind] = useState<DrinkKind>('beer');
  const lang = i18n.resolvedLanguage ?? 'en';
  const money = (amount: number) => formatMoney(amount, estimate.currency, lang);
  const cost = dailyCost(estimate.prices, { meals, drinks, mealStyle, drinkKind });
  return (
    <Card style={styles.card} testID="budget-card">
      <Text variant="heading">{t('prices.budgetTitle')}</Text>
      <StepSlider
        label={t('prices.meals')}
        value={meals}
        max={MAX_MEALS}
        onChange={(n) => setMeals(clampCount(n, MAX_MEALS))}
      />
      <Choices
        options={MEAL_STYLES}
        value={mealStyle}
        label={(o) => t(`prices.mealStyle.${o}`)}
        onChange={setMealStyle}
      />
      <StepSlider
        label={t('prices.drinks')}
        value={drinks}
        max={MAX_DRINKS}
        onChange={(n) => setDrinks(clampCount(n, MAX_DRINKS))}
      />
      <Choices
        options={DRINK_KINDS}
        value={drinkKind}
        label={(o) => t(`prices.drinkKind.${o}`)}
        onChange={setDrinkKind}
      />
      <View style={styles.result} accessibilityLiveRegion="polite">
        <Text variant="display" testID="budget-total">
          {t('prices.perDay', { amount: money(cost.total) })}
        </Text>
        <Text variant="caption" secondary testID="budget-breakdown">
          {t('prices.breakdown', { meals: money(cost.meals), drinks: money(cost.drinks) })}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.md, gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  result: { gap: spacing.xxs },
});
