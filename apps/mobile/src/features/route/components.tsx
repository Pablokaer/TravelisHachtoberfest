import {
  appleMapsLegUrl,
  googleMapsDirectionsUrl,
  googleMapsLegUrl,
  type Units,
} from '@wayfarer/shared';
import * as Linking from 'expo-linking';
import { Platform, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { Card, StatTile } from '@/components/card';
import { Icon } from '@/components/icon';
import { Section } from '@/components/screen';
import { Text } from '@/components/text';
import type { AttractionSummary } from '@/features/destinations/api';
import { localizedName } from '@/features/destinations/api';
import { formatDistance, formatDuration } from '@/lib/format';
import { radius, spacing } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

export function RouteTotals({
  distanceM,
  walkingSeconds,
  visitMinutes,
  units,
  isFallback,
  attribution,
}: {
  distanceM: number | null;
  walkingSeconds: number | null;
  visitMinutes: number;
  units: Units;
  isFallback?: boolean;
  attribution?: string | null;
}) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const lang = i18n.resolvedLanguage ?? 'en';
  const walk = walkingSeconds ?? 0;
  return (
    <View style={styles.totals} testID="route-totals">
      <View style={styles.stats}>
        <StatTile
          testID="route-distance"
          icon="route"
          label={t('route.distance')}
          value={distanceM != null ? formatDistance(distanceM, units, lang) : '–'}
        />
        <StatTile
          icon="walk"
          label={t('route.walking')}
          value={walkingSeconds != null ? formatDuration(walk) : '–'}
        />
        <StatTile
          icon="pin"
          label={t('route.visiting')}
          value={formatDuration(visitMinutes * 60)}
        />
        <StatTile
          icon="clock"
          label={t('route.total')}
          value={formatDuration(walk + visitMinutes * 60)}
        />
      </View>
      {isFallback ? (
        <View style={styles.notice}>
          <Icon name="info" size={14} color={theme.warning} />
          <Text variant="helper" secondary style={styles.flex}>
            {t('route.fallbackNotice')}
          </Text>
        </View>
      ) : null}
      {attribution ? (
        <Text variant="helper" secondary>
          {attribution}
        </Text>
      ) : null}
    </View>
  );
}

/** Links that open the walking route in Google Maps / Apple Maps. */
export function NavigationLinks({ stops }: { stops: AttractionSummary[] }) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const lang = i18n.resolvedLanguage ?? 'en';
  if (stops.length < 2) return null;
  const open = (url: string) => void Linking.openURL(url);
  return (
    <Section title={t('route.navigate')}>
      <Button
        variant="secondary"
        icon="directions"
        label={t('route.openGoogleMaps')}
        onPress={() => open(googleMapsDirectionsUrl(stops))}
      />
      {stops.length > 11 ? (
        <Text variant="helper" secondary>
          {t('route.googleLimit')}
        </Text>
      ) : null}
      <Text variant="label" secondary>
        {t('route.legByLeg')}
      </Text>
      <Card style={styles.legs}>
        {stops.slice(1).map((to, i) => {
          const from = stops[i]!;
          const label = t('route.leg', {
            from: localizedName(from, lang),
            to: localizedName(to, lang),
          });
          return (
            <View
              key={to.id}
              style={[
                styles.leg,
                i > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth },
              ]}>
              <View style={[styles.legNo, { backgroundColor: theme.surfaceMuted }]}>
                <Text variant="helper" style={styles.legNoText}>
                  {i + 1}→{i + 2}
                </Text>
              </View>
              <Text variant="caption" style={styles.flex} numberOfLines={2}>
                {label}
              </Text>
              <Button
                compact
                variant="ghost"
                label="Google"
                accessibilityLabel={`${label}, Google Maps`}
                onPress={() => open(googleMapsLegUrl(from, to))}
              />
              {Platform.OS !== 'android' ? (
                <Button
                  compact
                  variant="ghost"
                  label="Apple"
                  accessibilityLabel={`${label}, Apple Maps`}
                  onPress={() => open(appleMapsLegUrl(from, to))}
                />
              ) : null}
            </View>
          );
        })}
      </Card>
    </Section>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  totals: { gap: spacing.sm },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  legs: { paddingVertical: 0, gap: 0 },
  leg: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  legNo: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs, borderRadius: radius.sm },
  legNoText: { fontWeight: '600' },
});
