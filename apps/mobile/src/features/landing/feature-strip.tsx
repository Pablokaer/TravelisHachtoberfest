import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { LandingContainer } from './landing-section';
import { benefitColumns, type LandingLayout } from './layout';

import { Icon, type IconName } from '@/components/icon';
import { Text } from '@/components/text';
import { radius, spacing } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

const BENEFITS = [
  { key: 'explore', icon: 'pin' },
  { key: 'lists', icon: 'heart' },
  { key: 'map', icon: 'map' },
  { key: 'travel', icon: 'flight' },
] as const satisfies readonly { key: string; icon: IconName }[];

type BenefitId = (typeof BENEFITS)[number]['key'];

type BenefitProps = { id: BenefitId; icon: IconName; divided: boolean; inline: boolean };

/** One benefit: icon on top, or beside the text on phones (`inline`), where rows stack. */
function Benefit({ id, icon, divided, inline }: BenefitProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <View
      style={[
        styles.benefit,
        inline && styles.benefitInline,
        divided && [styles.divided, { borderLeftColor: theme.border }],
      ]}>
      <View style={[styles.icon, { backgroundColor: theme.primarySoft }]}>
        <Icon name={icon} size={22} color={theme.primary} />
      </View>
      <View style={[styles.words, inline && styles.wordsInline]}>
        <Text variant="subtitle" style={styles.title}>
          {t(`landing.features.${id}.title`)}
        </Text>
        <Text secondary style={styles.text}>
          {t(`landing.features.${id}.text`)}
        </Text>
      </View>
    </View>
  );
}

/**
 * Four benefits right under the hero (D-072), in one quiet bordered band.
 * @example <FeatureStrip layout={layout} width={width} />
 */
export function FeatureStrip({ layout, width }: { layout: LandingLayout; width: number }) {
  const theme = useTheme();
  const columns = benefitColumns(width);
  return (
    <LandingContainer gutter={layout.gutter}>
      <View style={[styles.band, { borderColor: theme.border }]}>
        {BENEFITS.map(({ key, icon }, i) => (
          <View key={key} style={{ width: `${100 / columns}%` }}>
            <Benefit id={key} icon={icon} divided={columns === 4 && i > 0} inline={columns === 1} />
          </View>
        ))}
      </View>
    </LandingContainer>
  );
}

const styles = StyleSheet.create({
  band: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingVertical: spacing.lg,
    borderWidth: 1,
    borderRadius: radius.xl,
  },
  benefit: { paddingHorizontal: spacing.lg + 4, paddingVertical: spacing.md, gap: spacing.sm },
  benefitInline: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  words: { gap: spacing.xs + 2 },
  wordsInline: { flex: 1, gap: spacing.xxs },
  divided: { borderLeftWidth: 1 },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 17, lineHeight: 24 },
  text: { fontSize: 15, lineHeight: 22 },
});
