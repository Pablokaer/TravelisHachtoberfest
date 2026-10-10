import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { PageHeader, Screen } from '@/components/screen';
import { LoadingState } from '@/components/states';
import { Text } from '@/components/text';
import { countryOf, useCities, type City } from '@/features/destinations/api';
import { useSaveFutureTrips } from '@/features/future-trips/api';
import { defaultPlanAgent } from '@/features/plan/default-agent';
import { useProfile, useSaveAvoidedCountries } from '@/features/profile/api';
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
type WindowProps = {
  wizard: PlanWizard;
  cities: City[];
  /** Whether the countries ticked are also kept in the profile (D-082). */
  remember: boolean;
  onRemember: (remember: boolean) => void;
  onNext: () => void;
};

function QuestionWindow({ wizard, cities, remember, onRemember, onNext }: WindowProps) {
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
        remember={remember}
        onRemember={onRemember}
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
          onPress={onNext}
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

/** The countries the app has cities in, by name in the language of the interface. */
function countriesOf(cities: City[], language: string) {
  const byCode = new Map(cities.map((c) => [c.countryCode, countryOf(c, language)]));
  return [...byCode]
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Plan your next trip (D-081): one question at a time, a shortlist of destinations that fit the
 * answers (distance, month, weather, attractions) ranked by the local model, and a way to keep the
 * ones that tempt in Future trips. The countries ruled out can be kept in the profile (D-082).
 */
export default function PlanScreen() {
  const { t } = useTranslation();
  const profile = useProfile();
  // The interview starts with the avoided countries of the profile, so wait for them.
  const loading = profile.isPending && profile.fetchStatus !== 'idle';
  return (
    <Screen>
      <PageHeader title={t('plan.title')} subtitle={t('plan.subtitle')} />
      {loading ? <LoadingState /> : <Interview avoided={profile.data?.avoidCountries ?? []} />}
    </Screen>
  );
}

function Interview({ avoided }: { avoided: string[] }) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? 'en';
  const cities = useCities();
  const save = useSaveFutureTrips();
  const saveAvoided = useSaveAvoidedCountries();
  const [started, setStarted] = useState(false);
  const [remember, setRemember] = useState(avoided.length > 0);
  const list = cities.data ?? [];
  const wizard = usePlanWizard({
    agent: defaultPlanAgent,
    loadCities: (month) => fetchPlanCities(list, month),
    cities: list,
    countries: countriesOf(list, language),
    avoidedCountries: avoided,
    t,
    language,
  });
  const goNext = () => {
    if (wizard.question.id === 'avoid' && remember) {
      saveAvoided.mutate(wizard.answer?.values ?? []);
    }
    void wizard.next();
  };
  const saveAll = (picked: { slug: string; reason: string | null }[]) =>
    save.mutate(futureTripsFrom(picked, wizard.plannedFor), {
      onSuccess: () => router.navigate('/future-trips'),
    });
  return (
    <>
      <View style={styles.body}>
        {!started ? <Intro onStart={() => setStarted(true)} /> : null}
        {started && wizard.phase === 'asking' ? (
          <QuestionWindow
            wizard={wizard}
            cities={list}
            remember={remember}
            onRemember={setRemember}
            onNext={goNext}
          />
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
    </>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.md },
  progress: { gap: spacing.xs },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  buttons: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
});
