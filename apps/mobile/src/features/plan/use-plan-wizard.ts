// The planner's interview as a state machine (D-081): one question at a time, a follow-up written
// by the local model from the answers so far (or a fixed one), and at the end the shortlist the
// code builds and the model ranks.
import { shortlistDestinations, type LatLng, type PlanCity } from '@wayfarer/shared';
import type { TFunction } from 'i18next';
import { useState } from 'react';

import type { City } from '@/features/destinations/api';
import { candidatesFrom } from './plan-data';
import type { PlanAgent } from './plan-agent';
import {
  answerSummary,
  buildProposals,
  CORE_QUESTION_IDS,
  isAnswered,
  preferencesFrom,
  PROPOSAL_COUNT,
  TOTAL_QUESTIONS,
  type AnswerMap,
  type PlanAnswer,
  type PlanQuestion,
  type Proposal,
} from './plan-flow';
import { coreQuestion, fallbackQuestion, type CountryOption } from './questions';

export type Origin = LatLng & { label: string };

export type WizardDeps = {
  /** The local model's client; null when no city builder is configured. */
  agent: PlanAgent | null;
  /** Climate, facts and profiles of every city for the chosen month. */
  loadCities: (month: number) => Promise<PlanCity[]>;
  cities: readonly City[];
  /** Countries that can be ruled out, in the language of the interface. */
  countries: readonly CountryOption[];
  /** Countries saved in the profile, ticked from the start (D-082). */
  avoidedCountries: readonly string[];
  t: TFunction;
  language: string;
};

type Phase = 'asking' | 'loadingQuestion' | 'thinking' | 'results' | 'error';

type State = {
  asked: PlanQuestion[];
  index: number;
  answers: AnswerMap;
  origin: Origin | null;
  phase: Phase;
  proposals: Proposal[];
  relaxed: boolean;
  error: string | null;
};

export type PlanWizard = {
  phase: Phase;
  question: PlanQuestion;
  index: number;
  total: number;
  answer: PlanAnswer | undefined;
  canNext: boolean;
  /** The day picked for the trip, as YYYY-MM-DD. */
  plannedFor: string | null;
  origin: Origin | null;
  proposals: Proposal[];
  relaxed: boolean;
  error: string | null;
  setAnswer: (answer: PlanAnswer) => void;
  setOrigin: (origin: Origin) => void;
  next: () => Promise<void>;
  back: () => void;
  restart: () => void;
};

const initialState = (t: TFunction, avoided: readonly string[]): State => ({
  asked: [coreQuestion('origin', t)],
  index: 0,
  answers: avoided.length > 0 ? { avoid: { values: [...avoided], other: '' } } : {},
  origin: null,
  phase: 'asking',
  proposals: [],
  relaxed: false,
  error: null,
});

/** The question after the ones asked: a fixed one, or the model's (the fixed list as a fallback). */
async function questionAfter(state: State, deps: WizardDeps): Promise<PlanQuestion> {
  const core = CORE_QUESTION_IDS[state.asked.length];
  if (core) return coreQuestion(core, deps.t, deps.countries);
  const fallback = fallbackQuestion(state.asked.length - CORE_QUESTION_IDS.length, deps.t);
  const written = await deps.agent?.nextQuestion(
    answerSummary(state.asked, state.answers),
    deps.language,
  );
  // A question already asked, or one with nothing to choose from, is not worth showing.
  const usable = written && !state.asked.some((q) => q.id === written.id);
  return usable ? written : fallback;
}

/** The proposals for the answers: the shortlist the code builds, ranked by the model if present. */
async function proposalsFor(state: State, deps: WizardDeps) {
  const prefs = preferencesFrom(state.answers, state.origin!);
  const { destinations, relaxed } = shortlistDestinations(
    await deps.loadCities(prefs.month),
    prefs,
  );
  const picks = await deps.agent?.rank(
    answerSummary(state.asked, state.answers),
    candidatesFrom(destinations, deps.cities, deps.language),
    deps.language,
    PROPOSAL_COUNT,
  );
  return { proposals: buildProposals(destinations, picks ?? null, PROPOSAL_COUNT), relaxed };
}

const canAdvance = (state: State): boolean => {
  const question = state.asked[state.index]!;
  const answer = state.answers[question.id];
  if (question.kind === 'origin') return state.origin !== null;
  // Ruling out no country at all is a fine answer.
  if (question.kind === 'countries') return true;
  if (question.kind === 'date') return !!answer?.values[0];
  return isAnswered(question, answer);
};

/**
 * @example const wizard = usePlanWizard({ agent, loadCities, cities, t, language: 'en' });
 */
export function usePlanWizard(deps: WizardDeps): PlanWizard {
  const [state, setState] = useState<State>(() => initialState(deps.t, deps.avoidedCountries));
  const patch = (changes: Partial<State>) => setState((s) => ({ ...s, ...changes }));
  const question = state.asked[state.index]!;

  const setAnswer = (answer: PlanAnswer) =>
    setState((s) => ({ ...s, answers: { ...s.answers, [question.id]: answer } }));
  const setOrigin = (origin: Origin) =>
    setState((s) => ({
      ...s,
      origin,
      answers: { ...s.answers, origin: { values: [], other: origin.label } },
    }));

  const finish = async () => {
    patch({ phase: 'thinking', error: null });
    try {
      patch({ ...(await proposalsFor(state, deps)), phase: 'results' });
    } catch (e) {
      patch({ phase: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  };

  const next = async () => {
    if (!canAdvance(state)) return;
    if (state.index < state.asked.length - 1) return patch({ index: state.index + 1 });
    if (state.asked.length === TOTAL_QUESTIONS) return finish();
    patch({ phase: 'loadingQuestion' });
    const following = await questionAfter(state, deps);
    patch({ asked: [...state.asked, following], index: state.index + 1, phase: 'asking' });
  };

  return {
    phase: state.phase,
    question,
    index: state.index,
    total: TOTAL_QUESTIONS,
    answer: state.answers[question.id],
    canNext: canAdvance(state),
    plannedFor: state.answers.date?.values[0] ?? null,
    origin: state.origin,
    proposals: state.proposals,
    relaxed: state.relaxed,
    error: state.error,
    setAnswer,
    setOrigin,
    next,
    back: () => patch({ index: Math.max(0, state.index - 1), phase: 'asking' }),
    restart: () => setState(initialState(deps.t, deps.avoidedCountries)),
  };
}
