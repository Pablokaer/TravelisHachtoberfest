// The planner's proposals (D-081): destinations that fit the answers, each with why, how far it is
// and its climate in the month of the trip. The traveller ticks the ones that tempt them and saves
// them to Future trips.
import { typicalDayCost } from '@wayfarer/shared';
import type { TFunction } from 'i18next';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/states';
import { Text } from '@/components/text';
import { WrapGrid } from '@/components/wrap-grid';
import { cityName, type City } from '@/features/destinations/api';
import { CityCard } from '@/features/destinations/city-card';
import { useCityPrices } from '@/features/prices/api';
import { formatMoney } from '@/lib/format';
import { spacing } from '@/theme/colors';
import type { Proposal } from './plan-flow';

type Picked = { slug: string; reason: string | null };

type Props = {
  proposals: Proposal[];
  cities: City[];
  /** True when too few cities matched the weather and the closest fits are shown. */
  relaxed: boolean;
  onSave: (picked: Picked[]) => void;
  onRestart?: () => void;
  saving?: boolean;
};

function climateLine(proposal: Proposal, t: TFunction): string | null {
  const climate = proposal.destination.climate;
  if (!climate) return null;
  const base = t('plan.climate', {
    temp: Math.round(climate.tempMeanC),
    sun: climate.sunshineHours.toFixed(1),
    rain: Math.round(climate.precipMm),
  });
  return climate.snowfallCm >= 1
    ? `${base} · ${t('plan.snowfall', { snow: Math.round(climate.snowfallCm) })}`
    : base;
}

/** What a typical day of food and drinks costs in the city, when it has an estimate (D-088). */
function PriceLine({ citySlug }: { citySlug: string }) {
  const { t, i18n } = useTranslation();
  const { data: estimate } = useCityPrices(citySlug);
  if (!estimate) return null;
  const amount = formatMoney(
    typicalDayCost(estimate.prices),
    estimate.currency,
    i18n.resolvedLanguage ?? 'en',
  );
  return (
    <Text variant="caption" secondary testID={`proposal-price-${citySlug}`}>
      {t('plan.typicalDay', { amount })}
    </Text>
  );
}

function ProposalCard(props: {
  proposal: Proposal;
  city: City;
  selected: boolean;
  onToggle: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { proposal, city, selected } = props;
  const name = cityName(city, i18n.resolvedLanguage ?? 'en');
  return (
    <View style={styles.card} testID={`proposal-${city.slug}`}>
      <CityCard
        city={city}
        onPress={() => router.push({ pathname: '/short/[slug]', params: { slug: city.slug } })}
      />
      {proposal.reason ? <Text>{proposal.reason}</Text> : null}
      <Text variant="caption" secondary>
        {t('plan.km', { km: Math.round(proposal.destination.distanceKm) })}
      </Text>
      <Text variant="caption" secondary>
        {climateLine(proposal, t)}
      </Text>
      <PriceLine citySlug={city.slug} />
      <Chip
        icon={selected ? 'bookmarked' : 'bookmark'}
        label={selected ? t('plan.selected', { city: name }) : t('plan.select', { city: name })}
        selected={selected}
        onPress={props.onToggle}
      />
    </View>
  );
}

function Notes({ proposals, relaxed }: Pick<Props, 'proposals' | 'relaxed'>) {
  const { t } = useTranslation();
  const byModel = proposals.some((p) => p.byModel);
  return (
    <View style={styles.notes}>
      {relaxed ? <Text secondary>{t('plan.relaxed')}</Text> : null}
      <Text variant="caption" secondary>
        {byModel ? t('plan.byModel') : t('plan.byRules')}
      </Text>
    </View>
  );
}

/**
 * @example <PlanResults proposals={wizard.proposals} cities={cities} relaxed={wizard.relaxed} onSave={save} />
 */
export function PlanResults({ proposals, cities, relaxed, onSave, onRestart, saving }: Props) {
  const { t } = useTranslation();
  const [chosen, setChosen] = useState<string[]>([]);
  if (proposals.length === 0) {
    return (
      <EmptyState
        icon="globe"
        title={t('plan.noResults')}
        body={t('plan.noResultsBody')}
        action={onRestart ? <Button label={t('plan.startOver')} onPress={onRestart} /> : undefined}
      />
    );
  }
  const shown = proposals.flatMap((proposal) => {
    const city = cities.find((c) => c.slug === proposal.destination.slug);
    return city ? [{ proposal, city }] : [];
  });
  const toggle = (slug: string) =>
    setChosen((now) => (now.includes(slug) ? now.filter((s) => s !== slug) : [...now, slug]));
  const save = () =>
    onSave(
      chosen.map((slug) => ({
        slug,
        reason: proposals.find((p) => p.destination.slug === slug)?.reason ?? null,
      })),
    );
  return (
    <View style={styles.results}>
      <Text variant="heading">{t('plan.resultsTitle')}</Text>
      <Text secondary>{t('plan.resultsBody')}</Text>
      <Notes proposals={proposals} relaxed={relaxed} />
      <WrapGrid
        items={shown}
        keyOf={(s) => s.city.slug}
        renderItem={(s) => (
          <ProposalCard
            {...s}
            selected={chosen.includes(s.city.slug)}
            onToggle={() => toggle(s.city.slug)}
          />
        )}
      />
      <Button
        icon="bookmarked"
        label={t('plan.saveSelected', { count: chosen.length })}
        disabled={chosen.length === 0}
        loading={saving}
        onPress={save}
        testID="plan-save"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  results: { gap: spacing.md },
  notes: { gap: spacing.xs },
  card: { gap: spacing.sm },
});
