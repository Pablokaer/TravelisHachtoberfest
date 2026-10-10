import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { LandingContainer, SectionHeading } from './landing-section';
import { benefitColumns, type LandingLayout } from './layout';

import { Icon, type IconName } from '@/components/icon';
import { Text } from '@/components/text';
import { spacing } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

const STEPS = [
  { key: 'city', icon: 'globe' },
  { key: 'discover', icon: 'search' },
  { key: 'list', icon: 'heart' },
  { key: 'route', icon: 'route' },
] as const satisfies readonly { key: string; icon: IconName }[];

type StepId = (typeof STEPS)[number]['key'];
const BADGE = 44;

type StepProps = {
  id: StepId;
  icon: IconName;
  index: number;
  /** A line to the next step, when they share a row. */
  connected: boolean;
  /** Phones: the number beside the text instead of above it. */
  inline: boolean;
};

function Step({ id, icon, index, connected, inline }: StepProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <View style={[styles.step, inline && styles.stepInline]}>
      <View style={styles.badgeRow}>
        <View
          style={[styles.badge, { backgroundColor: theme.background, borderColor: theme.primary }]}>
          <Text variant="label" style={[styles.number, { color: theme.primary }]}>
            {index + 1}
          </Text>
        </View>
        {connected ? (
          <View style={[styles.connector, { backgroundColor: theme.borderStrong }]} />
        ) : null}
      </View>
      <View style={[styles.words, inline && styles.wordsInline]}>
        <View style={styles.stepTitle}>
          <Icon name={icon} size={18} color={theme.primary} />
          <Text variant="subtitle" style={styles.title}>
            {t(`landing.how.${id}.title`)}
          </Text>
        </View>
        <Text secondary style={styles.text}>
          {t(`landing.how.${id}.text`)}
        </Text>
      </View>
    </View>
  );
}

/**
 * "Plan your trip in minutes" (D-072): the four steps from a city to a walking route, joined
 * by a line when they share a row.
 * @example <HowItWorks layout={layout} width={width} />
 */
export function HowItWorks({ layout, width }: { layout: LandingLayout; width: number }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const columns = benefitColumns(width);
  return (
    <View style={[styles.band, { backgroundColor: theme.surfaceMuted }]}>
      <LandingContainer gutter={layout.gutter} style={styles.inner}>
        <SectionHeading
          title={t('landing.how.title')}
          subtitle={t('landing.how.subtitle')}
          centered
          compact={width < 600}
        />
        <View style={styles.steps}>
          {STEPS.map(({ key, icon }, i) => (
            <View key={key} style={{ width: `${100 / columns}%` }}>
              <Step
                id={key}
                icon={icon}
                index={i}
                connected={columns === 4 && i < STEPS.length - 1}
                inline={columns === 1}
              />
            </View>
          ))}
        </View>
      </LandingContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  band: { paddingVertical: 88 },
  inner: { gap: spacing.xxl },
  steps: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.xl },
  step: { paddingRight: spacing.lg, gap: spacing.md - 2 },
  stepInline: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingRight: 0 },
  words: { gap: spacing.sm },
  wordsInline: { flex: 1, paddingTop: spacing.sm + 2 },
  badgeRow: { flexDirection: 'row', alignItems: 'center' },
  badge: {
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  number: { fontSize: 16, lineHeight: 20, fontWeight: '700' },
  connector: { flex: 1, height: 1, marginLeft: spacing.md, marginRight: -spacing.lg + spacing.md },
  stepTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { fontSize: 17, lineHeight: 24 },
  text: { fontSize: 15, lineHeight: 22, maxWidth: 260 },
});
