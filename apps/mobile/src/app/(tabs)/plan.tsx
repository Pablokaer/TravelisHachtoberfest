import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { PageHeader, Screen } from '@/components/screen';
import { LoadingState } from '@/components/states';
import { Text } from '@/components/text';
import { useCities, type City } from '@/features/destinations/api';
import { useSaveFutureTrips } from '@/features/future-trips/api';
import { defaultPlanAgent } from '@/features/plan/default-agent';
import { fetchPlanCities } from '@/features/plan/plan-data';
import { futureTripsFrom } from '@/features/plan/plan-flow';
import { PlanQuestionView } from '@/features/plan/plan-question-view';
import { PlanResults } from '@/features/plan/plan-results';
import { usePlanWizard, type PlanWizard } from '@/features/plan/use-plan-wizard';
import { spacing } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

const todayIso = (): string => new Date().toISOString().slice(0, 10);

function Intro({ onStart }: { onStart: () => void }) {
  const { t } = useTranslation();
  return (
    <Card>
      <Text secondary>{t('plan.intro')}</Text>
      <Button icon="sparkles" label={t('plan.start')} onPress={onStart} testID="plan-start" />
    </Card>
  );
}

function ProgressBar({ index, total }: { index: number; total: number }) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View style={styles.progress}>
      <Text variant="caption" secondary>
        {t('plan.progress', { current: index + 1, total })}
      </Text>
      <View style={[styles.track, { backgroundColor: theme.border }]}>
        <View
          style={[
            styles.fill,
            { width: `${((index + 1) / total) * 100}%`, backgroundColor: theme.primary },
          ]}
        />
      </View>
    </View>
  );
}

/** One question in its window, with Back and Next. */
function QuestionWindow({ wizard, cities }: { wizard: PlanWizard; cities: City[] }) {
  const { t } = useTranslation();
  const last = wizard.index === wizard.total - 1;
  return (
    <Card>
      <ProgressBar index={wizard.index} total={wizard.total} />
      <Text variant="heading">{wizard.question.text}</Text>
      <PlanQuestionView
        question={wizard.question}
        answer={wizard.answer}
        onAnswer={wizard.setAnswer}
        origin={wizard.origin}
        onOrigin={wizard.setOrigin}
        cities={cities}
        today={todayIso()}
      />
      <View style={styles.buttons}>
        <Button
          variant="secondary"
          label={t('plan.back')}
          disabled={wizard.index === 0}
          onPress={wizard.back}
        />
        <Button
          label={last ? t('plan.finish') : t('plan.next')}
          disabled={!wizard.canNext}
          onPress={() => void wizard.next()}
        />
      </View>
    </Card>
  );
}

function Waiting({ title, body }: { title: string; body?: string }) {
  return (
    <Card>
      <Text variant="heading">{title}</Text>
      {body ? <Text secondary>{body}</Text> : null}
      <LoadingState />
    </Card>
  );
}

function Failure({ wizard }: { wizard: PlanWizard }) {
  const { t } = useTranslation();
  return (
    <Card>
      <Text variant="heading">{t('plan.errorTitle')}</Text>
      <Text secondary>{t('plan.errorBody', { message: wizard.error })}</Text>
      <Button label={t('plan.tryAgain')} onPress={() => void wizard.next()} />
    </Card>
  );
}

/**
 * Plan your next trip (D-081): one question at a time, a shortlist of destinations that fit the
 * answers (distance, month, weather, attractions) ranked by the local model, and a way to keep the
 * ones that tempt in Future trips.
 */
export default function PlanScreen() {
  const { t, i18n } = useTranslation();
  const cities = useCities();
  const save = useSaveFutureTrips();
  const [started, setStarted] = useState(false);
  const list = cities.data ?? [];
  const wizard = usePlanWizard({
    agent: defaultPlanAgent,
    loadCities: (month) => fetchPlanCities(list, month),
    cities: list,
    t,
    language: i18n.resolvedLanguage ?? 'en',
  });
  const saveAll = (picked: { slug: string; reason: string | null }[]) =>
    save.mutate(futureTripsFrom(picked, wizard.plannedFor), {
      onSuccess: () => router.navigate('/future-trips'),
    });
  return (
    <Screen>
      <PageHeader title={t('plan.title')} subtitle={t('plan.subtitle')} />
      <View style={styles.body}>
        {!started ? <Intro onStart={() => setStarted(true)} /> : null}
        {started && wizard.phase === 'asking' ? (
          <QuestionWindow wizard={wizard} cities={list} />
        ) : null}
        {started && wizard.phase === 'loadingQuestion' ? (
          <Waiting title={t('plan.loadingQuestion')} />
        ) : null}
        {started && wizard.phase === 'thinking' ? (
          <Waiting title={t('plan.thinking')} body={t('plan.thinkingBody')} />
        ) : null}
        {started && wizard.phase === 'error' ? <Failure wizard={wizard} /> : null}
        {started && wizard.phase === 'results' ? (
          <PlanResults
            proposals={wizard.proposals}
            cities={list}
            relaxed={wizard.relaxed}
            onSave={saveAll}
            onRestart={wizard.restart}
            saving={save.isPending}
          />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.md },
  progress: { gap: spacing.xs },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  buttons: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
});
