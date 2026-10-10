import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PlanCity } from '@wayfarer/shared';

import type { City } from '@/features/destinations/api';
import type { AnswerSummary, PlanAgent, RankCandidate } from '@/features/plan/plan-agent';
import type { PlanQuestion, RankedPick } from '@/features/plan/plan-flow';
import { usePlanWizard } from '@/features/plan/use-plan-wizard';
import i18n from '@/lib/i18n';
import { fakeCity } from '@/testing/fixtures';

const t = i18n.getFixedT('en');

/** A model that answers with what the test scripts, and remembers what it was asked. */
class FakeAgent implements PlanAgent {
  asked: AnswerSummary[][] = [];
  ranked: RankCandidate[][] = [];
  constructor(
    private readonly questions: (PlanQuestion | null)[] = [],
    private readonly picks: RankedPick[] | null = null,
  ) {}
  async nextQuestion(answers: AnswerSummary[]): Promise<PlanQuestion | null> {
    this.asked.push(answers);
    return this.questions.shift() ?? null;
  }
  async rank(_: AnswerSummary[], candidates: RankCandidate[]): Promise<RankedPick[] | null> {
    this.ranked.push(candidates);
    return this.picks;
  }
}

const rio = fakeCity({ slug: 'rio', nameEn: 'Rio', countryCode: 'BR', lat: -22.9, lng: -43.2 });
const oslo = fakeCity({ slug: 'oslo', nameEn: 'Oslo', countryCode: 'NO', lat: 59.9, lng: 10.7 });
const COUNTRIES = [
  { code: 'BR', name: 'Brazil' },
  { code: 'NO', name: 'Norway' },
];
const cities: City[] = [rio, oslo];
const planCity = (
  slug: string,
  lat: number,
  lng: number,
  over: Partial<PlanCity> = {},
): PlanCity => ({
  slug,
  lat,
  lng,
  countryCode: slug === 'oslo' ? 'NO' : 'BR',
  climate: { tempMeanC: 26, tempMaxC: 31, precipMm: 60, snowfallCm: 0, sunshineHours: 9 },
  facts: null,
  profile: null,
  ...over,
});
const loadCities = async (): Promise<PlanCity[]> => [
  planCity('rio', -22.9, -43.2),
  planCity('oslo', 59.9, 10.7, {
    climate: { tempMeanC: -3, tempMaxC: 0, precipMm: 50, snowfallCm: 30, sunshineHours: 1 },
  }),
];

const aiQuestion = (id: string): PlanQuestion => ({
  id,
  kind: 'single',
  text: `Follow-up ${id}`,
  options: [{ value: 'a', label: 'A' }],
  allowOther: true,
  source: 'ai',
});

function setup(agent: PlanAgent | null, avoidedCountries: string[] = []) {
  return renderHook(() =>
    usePlanWizard({
      agent,
      loadCities,
      cities,
      countries: COUNTRIES,
      avoidedCountries,
      t,
      language: 'en',
    }),
  );
}

/** Answers the current question with this answer and moves on, waiting for the next question. */
async function answer(
  hook: ReturnType<typeof setup>,
  values: string[],
  other = '',
  expectNext?: string,
) {
  act(() => hook.result.current.setAnswer({ values, other }));
  await act(async () => hook.result.current.next());
  if (expectNext) await waitFor(() => expect(hook.result.current.question.id).toBe(expectNext));
}

async function answerCoreQuestions(hook: ReturnType<typeof setup>) {
  act(() => hook.result.current.setOrigin({ lat: -23.55, lng: -46.63, label: 'São Paulo' }));
  await act(async () => hook.result.current.next());
  await answer(hook, ['2026-12-10'], '', 'length');
  await answer(hook, ['week'], '', 'distance');
  await answer(hook, ['km-4000'], '', 'avoid');
  // Left as it is (empty, or ticked from the profile): the avoid question needs no answer.
  await act(async () => hook.result.current.next());
  await waitFor(() => expect(hook.result.current.question.id).toBe('weather'));
  await answer(hook, ['sunny', 'warm'], '', 'attractions');
  await answer(hook, ['beaches'], '', 'character');
}

describe('usePlanWizard (D-081)', () => {
  test('starts by asking where the traveller starts from and waits for the answer', async () => {
    const hook = setup(null);
    expect(hook.result.current).toMatchObject({ phase: 'asking', index: 0, total: 10 });
    expect(hook.result.current.question.id).toBe('origin');
    expect(hook.result.current.canNext).toBe(false);
    act(() => hook.result.current.setOrigin({ lat: -23.55, lng: -46.63, label: 'São Paulo' }));
    expect(hook.result.current.canNext).toBe(true);
  });

  test('the date question needs a day; the next one follows the answer', async () => {
    const hook = setup(null);
    act(() => hook.result.current.setOrigin({ lat: 0, lng: 0, label: 'Here' }));
    await act(async () => hook.result.current.next());
    expect(hook.result.current.question.id).toBe('date');
    expect(hook.result.current.canNext).toBe(false);
    await answer(hook, ['2026-12-10'], '', 'length');
    expect(hook.result.current.index).toBe(2);
  });

  test('a typed answer is enough to go on', async () => {
    const hook = setup(null);
    await answerCoreQuestions(hook);
    act(() =>
      hook.result.current.setAnswer({ values: [], other: 'tech hubs, and not too touristy' }),
    );
    expect(hook.result.current.canNext).toBe(true);
  });

  test('after the core questions the model writes the follow-ups from the answers so far', async () => {
    const agent = new FakeAgent([aiQuestion('ai-8'), aiQuestion('ai-9')]);
    const hook = setup(agent);
    await answerCoreQuestions(hook);
    await answer(hook, ['ancient'], '', 'ai-8');
    expect(hook.result.current.question.source).toBe('ai');
    // The avoid question was left empty, so there is nothing to tell the model about it.
    expect(agent.asked[0]!.map((a) => a.id)).toEqual([
      'origin',
      'date',
      'length',
      'distance',
      'weather',
      'attractions',
      'character',
    ]);
    await answer(hook, ['a'], '', 'ai-9');
    expect(hook.result.current.index).toBe(9);
  });

  test('without the model the follow-ups come from the fixed list', async () => {
    const hook = setup(null);
    await answerCoreQuestions(hook);
    await answer(hook, ['ancient'], '', 'pace');
    await answer(hook, ['relaxed'], '', 'extra');
    expect(hook.result.current.question.kind).toBe('text');
  });

  test('Back returns to the previous question with its answer kept', async () => {
    const hook = setup(null);
    act(() => hook.result.current.setOrigin({ lat: 0, lng: 0, label: 'Here' }));
    await act(async () => hook.result.current.next());
    await answer(hook, ['2026-12-10'], '', 'length');
    act(() => hook.result.current.back());
    expect(hook.result.current.question.id).toBe('date');
    expect(hook.result.current.answer).toEqual({ values: ['2026-12-10'], other: '' });
  });

  test('the last answer shows the destinations the model picked among the cities that fit', async () => {
    const agent = new FakeAgent(
      [null, null],
      [{ slug: 'rio', reason: 'Warm beaches in December.' }],
    );
    const hook = setup(agent);
    await answerCoreQuestions(hook);
    await answer(hook, ['ancient'], '', 'pace');
    await answer(hook, ['relaxed'], '', 'extra');
    await answer(hook, [], 'near a night market');
    await waitFor(() => expect(hook.result.current.phase).toBe('results'));
    expect(
      hook.result.current.proposals.map((p) => [p.destination.slug, p.reason, p.byModel]),
    ).toEqual([['rio', 'Warm beaches in December.', true]]);
    // Oslo is dark and snowy in December: the model is never even shown it.
    expect(agent.ranked[0]!.map((c) => c.slug)).toEqual(['rio']);
  });

  test('without the model the best fits are proposed by score', async () => {
    const hook = setup(null);
    await answerCoreQuestions(hook);
    await answer(hook, ['ancient'], '', 'pace');
    await answer(hook, ['relaxed'], '', 'extra');
    await answer(hook, [], 'anything');
    await waitFor(() => expect(hook.result.current.phase).toBe('results'));
    expect(hook.result.current.proposals.map((p) => [p.destination.slug, p.byModel])).toEqual([
      ['rio', false],
    ]);
  });

  test('the avoid question may be left empty, and countries saved in the profile come ticked', async () => {
    const hook = setup(null, ['NO']);
    await answerCoreQuestions(hook);
    act(() => hook.result.current.back());
    act(() => hook.result.current.back());
    act(() => hook.result.current.back());
    expect(hook.result.current.question.id).toBe('avoid');
    expect(hook.result.current.question.kind).toBe('countries');
    expect(hook.result.current.answer).toEqual({ values: ['NO'], other: '' });
    expect(hook.result.current.canNext).toBe(true);
    act(() => hook.result.current.setAnswer({ values: [], other: '' }));
    expect(hook.result.current.canNext).toBe(true);
  });

  test('an avoided country is never proposed, and the model is told which', async () => {
    const agent = new FakeAgent([null, null], [{ slug: 'rio', reason: 'Warm.' }]);
    const hook = setup(agent, ['BR']);
    await answerCoreQuestions(hook);
    // The traveller keeps the saved avoidance of Brazil (the ticked answer is not changed).
    await answer(hook, ['ancient'], '', 'pace');
    await answer(hook, ['relaxed'], '', 'extra');
    await answer(hook, [], 'anything');
    await waitFor(() => expect(hook.result.current.phase).toBe('results'));
    expect(hook.result.current.proposals).toEqual([]);
    expect(agent.asked[0]).toContainEqual({
      id: 'avoid',
      question: 'Are there countries you do not want as options?',
      answer: 'Brazil',
    });
  });
});
