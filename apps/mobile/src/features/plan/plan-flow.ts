// The trip planner's questions and answers (D-081). The first seven questions are fixed because
// they feed hard limits (month, distance) and the scoring; the last three are written by the local
// model from what the traveller already said, so the interview is not always the same. Every
// answer can also be typed, and typed text goes to the model as it is.
import {
  monthOf,
  type AttractionWish,
  type CharacterWish,
  type LatLng,
  type PlanPreferences,
  type ScoredDestination,
  type WeatherWish,
} from '@wayfarer/shared';

import type { FutureTrip } from '@/features/future-trips/api';

export type QuestionKind = 'origin' | 'date' | 'single' | 'multi' | 'countries' | 'text';

export type PlanQuestion = {
  id: string;
  kind: QuestionKind;
  /** Already in the language of the interface. */
  text: string;
  options: { value: string; label: string }[];
  /** Whether the traveller can type an answer of their own. */
  allowOther: boolean;
  source: 'core' | 'ai' | 'fallback';
};

/** What was answered: the options chosen (a date for `date`) and the text typed, if any. */
export type PlanAnswer = { values: string[]; other: string };
export type AnswerMap = Record<string, PlanAnswer>;

/** Fixed questions, in the order they are asked. */
export const CORE_QUESTION_IDS = [
  'origin',
  'date',
  'length',
  'distance',
  'avoid',
  'weather',
  'attractions',
  'character',
] as const;
/** Questions written by the model (or a fixed list when it is not there) after the core ones. */
export const FOLLOW_UP_COUNT = 2;
export const TOTAL_QUESTIONS = CORE_QUESTION_IDS.length + FOLLOW_UP_COUNT;
/** Destinations shown at the end. */
export const PROPOSAL_COUNT = 6;

const DISTANCE_OPTION_KM: Record<string, number | null> = {
  'km-500': 500,
  'km-1500': 1500,
  'km-4000': 4000,
  'km-8000': 8000,
  any: null,
};

const WEATHER: readonly string[] = ['sunny', 'warm', 'hot', 'mild', 'cool', 'rainy', 'snow'];
const ATTRACTIONS: readonly string[] = [
  'beaches',
  'castles',
  'history',
  'museums',
  'nature',
  'churches',
  'viewpoints',
];
const CHARACTER: readonly string[] = ['ancient', 'big-city', 'small-quiet'];

/**
 * How far the traveller will go, in km: a number they typed wins over the option; null is "any".
 * @example maxKmFrom({ values: [], other: '2500 km' }) // 2500
 */
export function maxKmFrom(answer: PlanAnswer | undefined): number | null {
  const typed = Number(answer?.other.replace(/[,\s]/g, '').replace(/km$/i, ''));
  if (typed > 0) return typed;
  return DISTANCE_OPTION_KM[answer?.values[0] ?? 'any'] ?? null;
}

const valuesOf = <T extends string>(
  answer: PlanAnswer | undefined,
  known: readonly string[],
): T[] => (answer?.values.filter((v) => known.includes(v)) ?? []) as T[];

/** The countries ticked in the avoid question, as upper-case ISO codes. */
export function countryCodesFrom(answer: PlanAnswer | undefined): string[] {
  return (answer?.values ?? []).filter((code) => /^[A-Z]{2}$/.test(code));
}

/**
 * The answers as the hard limits and wishes the scoring understands.
 * @example preferencesFrom(answers, { lat: -23.55, lng: -46.63 }).month // 12
 */
export function preferencesFrom(answers: AnswerMap, origin: LatLng): PlanPreferences {
  const date = answers.date?.values[0];
  if (!date) throw new Error('The date question has no answer: expected a day as YYYY-MM-DD');
  return {
    origin,
    maxKm: maxKmFrom(answers.distance),
    excludedCountries: countryCodesFrom(answers.avoid),
    month: monthOf(date),
    weather: valuesOf<WeatherWish>(answers.weather, WEATHER),
    attractions: valuesOf<AttractionWish>(answers.attractions, ATTRACTIONS),
    character: valuesOf<CharacterWish>(answers.character, CHARACTER),
  };
}

/** A question is answered by a choice or by text typed instead. */
export function isAnswered(_question: PlanQuestion, answer: PlanAnswer | undefined): boolean {
  return !!answer && (answer.values.length > 0 || answer.other.trim() !== '');
}

function answerText(question: PlanQuestion, answer: PlanAnswer): string {
  const labels = answer.values.map(
    (value) => question.options.find((o) => o.value === value)?.label ?? value,
  );
  return [...labels, answer.other.trim()].filter(Boolean).join(', ');
}

/**
 * The questions asked and the answers given, as the model reads them.
 * @example answerSummary(asked, answers) // [{ id: 'weather', question: '…', answer: 'Sunny' }]
 */
export function answerSummary(
  asked: readonly PlanQuestion[],
  answers: AnswerMap,
): { id: string; question: string; answer: string }[] {
  return asked.flatMap((q) => {
    const answer = answers[q.id];
    return answer && isAnswered(q, answer)
      ? [{ id: q.id, question: q.text, answer: answerText(q, answer) }]
      : [];
  });
}

/**
 * The ticked destinations as rows of Future trips, all for the day picked in the planner.
 * @example futureTripsFrom([{ slug: 'lima', reason: 'Warm coast.' }], '2026-12-10')
 */
export function futureTripsFrom(
  picked: readonly { slug: string; reason: string | null }[],
  plannedFor: string | null,
): FutureTrip[] {
  return picked.map((p) => ({ citySlug: p.slug, reason: p.reason, plannedFor }));
}

export type RankedPick = { slug: string; reason: string };

export type Proposal = {
  destination: ScoredDestination;
  /** Why it fits, written by the model; null when the model was not available. */
  reason: string | null;
  byModel: boolean;
};

/**
 * What is proposed: the model's picks (only places the code offered, in its order) or, without
 * the model, the best fits by score.
 * @example buildProposals(shortlist, [{ slug: 'lima', reason: 'Warm coast.' }], 6)
 */
export function buildProposals(
  shortlist: readonly ScoredDestination[],
  picks: readonly RankedPick[] | null,
  limit: number,
): Proposal[] {
  if (!picks) {
    return shortlist
      .slice(0, limit)
      .map((destination) => ({ destination, reason: null, byModel: false }));
  }
  return picks
    .flatMap((pick) => {
      const destination = shortlist.find((d) => d.slug === pick.slug);
      return destination ? [{ destination, reason: pick.reason, byModel: true }] : [];
    })
    .slice(0, limit);
}
