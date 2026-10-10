// The planner's fixed questions (D-081), written from the translations so they follow the
// language of the interface. The model's own follow-ups come from the city builder service.
import type { TFunction } from 'i18next';

import {
  CORE_QUESTION_IDS,
  FOLLOW_UP_COUNT,
  type PlanQuestion,
  type QuestionKind,
} from './plan-flow';

type CoreId = (typeof CORE_QUESTION_IDS)[number];

const CORE_KINDS: Record<CoreId, QuestionKind> = {
  origin: 'origin',
  date: 'date',
  length: 'single',
  distance: 'single',
  weather: 'multi',
  attractions: 'multi',
  character: 'multi',
};

/** Options of each question, in the order shown. */
const OPTIONS: Record<string, readonly string[]> = {
  length: ['weekend', 'week', 'fortnight', 'long'],
  distance: ['km-500', 'km-1500', 'km-4000', 'km-8000', 'any'],
  weather: ['sunny', 'warm', 'hot', 'mild', 'cool', 'rainy', 'snow'],
  attractions: ['beaches', 'castles', 'history', 'museums', 'nature', 'churches', 'viewpoints'],
  character: ['ancient', 'big-city', 'small-quiet', 'tech', 'food'],
  pace: ['relaxed', 'balanced', 'packed'],
  company: ['solo', 'couple', 'family', 'friends'],
};

/** Follow-ups used when the model cannot write them, in the order asked. */
const FALLBACKS: readonly { id: string; kind: QuestionKind }[] = [
  { id: 'pace', kind: 'single' },
  { id: 'company', kind: 'single' },
  { id: 'extra', kind: 'text' },
];

/** Keys are built from question ids, which the typed key list cannot follow. */
const translate = (t: TFunction, key: string): string =>
  (t as unknown as (k: string) => string)(key);

function build(
  id: string,
  kind: QuestionKind,
  source: PlanQuestion['source'],
  t: TFunction,
): PlanQuestion {
  return {
    id,
    kind,
    source,
    text: translate(t, `plan.q.${id}.text`),
    options: (OPTIONS[id] ?? []).map((value) => ({
      value,
      label: translate(t, `plan.q.${id}.opt.${value}`),
    })),
    allowOther: true,
  };
}

/**
 * @example coreQuestion('weather', t).options[0] // { value: 'sunny', label: 'Sunny' }
 */
export function coreQuestion(id: CoreId, t: TFunction): PlanQuestion {
  return build(id, CORE_KINDS[id], 'core', t);
}

/**
 * The n-th follow-up (from 0) of the fixed list.
 * @example fallbackQuestion(0, t).id // 'pace'
 */
export function fallbackQuestion(index: number, t: TFunction): PlanQuestion {
  const entry = FALLBACKS[index];
  if (!entry)
    throw new Error(
      `Fallback question ${index} does not exist: expected 0 to ${FOLLOW_UP_COUNT - 1}`,
    );
  return build(entry.id, entry.kind, 'fallback', t);
}
