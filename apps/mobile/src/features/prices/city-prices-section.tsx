// The city page's "Estimated prices" (D-088): what a beer, a meal, a Big Mac, a ticket and a ride
// cost here, clearly marked as modelled, and the day's budget calculator below.
import type { CityPrices } from '@wayfarer/shared';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Card } from '@/components/card';
import { Section } from '@/components/screen';
import { Text } from '@/components/text';
import { formatMoney } from '@/lib/format';
import { spacing } from '@/theme/colors';
import { useCityPrices } from './api';
import { BudgetCard } from './budget-card';

const ROWS: (keyof CityPrices)[] = [
  'beer',
  'softDrink',
  'cocktail',
  'coffee',
  'mealCheap',
  'mealMid',
  'localDish',
  'bigMac',
  'transportTicket',
  'taxi5km',
];

/**
 * Nothing at all for a city without an estimate, so a city built on demand before its prices
 * arrive does not show an empty box.
 * @example <CityPricesSection citySlug="lisbon" cityName="Lisbon" />
 */
export function CityPricesSection({ citySlug, cityName }: { citySlug: string; cityName: string }) {
  const { t, i18n } = useTranslation();
  const { data: estimate } = useCityPrices(citySlug);
  if (!estimate) return null;
  const lang = i18n.resolvedLanguage ?? 'en';
  return (
    <View testID="city-prices">
      <Section title={t('prices.title', { city: cityName })}>
        <Card style={styles.list}>
          {ROWS.map((key) => (
            <View key={key} style={styles.row}>
              <Text style={styles.label}>{t(`prices.item.${key}`)}</Text>
              <Text variant="subtitle" testID={`price-${key}`}>
                {formatMoney(estimate.prices[key], estimate.currency, lang)}
                {key === 'bigMac' && estimate.bigMacIsReal ? ` · ${t('prices.bigMacIndex')}` : ''}
              </Text>
            </View>
          ))}
        </Card>
        <BudgetCard estimate={estimate} />
        <Text variant="helper" secondary>
          {t('prices.note')}
        </Text>
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.md, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  label: { flex: 1 },
});
