import type { ScoredDestination } from '@wayfarer/shared';

import {
  answerSummary,
  buildProposals,
  futureTripsFrom,
  isAnswered,
  maxKmFrom,
  preferencesFrom,
  TOTAL_QUESTIONS,
  type AnswerMap,
  type PlanQuestion,
} from '@/features/plan/plan-flow';

const question = (
  over: Partial<PlanQuestion> & Pick<PlanQuestion, 'id' | 'kind'>,
): PlanQuestion => ({
  text: `Question ${over.id}`,
  options: [],
  allowOther: true,
  source: 'core',
  ...over,
});

const ORIGIN = { lat: -23.55, lng: -46.63 };

const answers: AnswerMap = {
  date: { values: ['2026-12-10'], other: '' },
  distance: { values: ['km-4000'], other: '' },
  weather: { values: ['sunny', 'warm'], other: '' },
  attractions: { values: ['beaches', 'castles'], other: '' },
  character: { values: ['ancient', 'tech'], other: '' },
};

describe('maxKmFrom', () => {
  test('an option sets the distance; "any" means no limit', () => {
    expect(maxKmFrom({ values: ['km-1500'], other: '' })).toBe(1500);
    expect(maxKmFrom({ values: ['any'], other: '' })).toBeNull();
  });

  test('a number typed by the traveller wins over the option', () => {
    expect(maxKmFrom({ values: [], other: '2500 km' })).toBe(2500);
    expect(maxKmFrom({ values: ['km-500'], other: '3,000' })).toBe(3000);
  });

  test('typed text that is not a number leaves the limit to the option', () => {
    expect(maxKmFrom({ values: ['km-500'], other: 'not too far' })).toBe(500);
  });

  test('no answer is no limit', () => {
    expect(maxKmFrom(undefined)).toBeNull();
  });
});

describe('preferencesFrom', () => {
  test('turns the answers into hard limits and wishes the scoring understands', () => {
    expect(preferencesFrom(answers, ORIGIN)).toEqual({
      origin: ORIGIN,
      maxKm: 4000,
      month: 12,
      weather: ['sunny', 'warm'],
      attractions: ['beaches', 'castles'],
      // "tech" has no data behind it: it goes to the model as text, not to the scoring.
      character: ['ancient'],
    });
  });

  test('a missing date is an error naming what is missing', () => {
    expect(() => preferencesFrom({}, ORIGIN)).toThrow(/date.*YYYY-MM-DD/);
  });
});

describe('isAnswered and answerSummary', () => {
  test('a question is answered by a choice or by typed text', () => {
    const q = question({ id: 'weather', kind: 'multi' });
    expect(isAnswered(q, undefined)).toBe(false);
    expect(isAnswered(q, { values: [], other: '  ' })).toBe(false);
    expect(isAnswered(q, { values: ['sunny'], other: '' })).toBe(true);
    expect(isAnswered(q, { values: [], other: 'rain but warm' })).toBe(true);
  });

  test('the summary for the model uses the labels the traveller saw, and the typed text', () => {
    const asked = [
      question({
        id: 'weather',
        kind: 'multi',
        text: 'What weather do you hope for?',
        options: [
          { value: 'sunny', label: 'Sunny' },
          { value: 'warm', label: 'Warm' },
        ],
      }),
      question({ id: 'date', kind: 'date', text: 'When?' }),
      question({ id: 'extra', kind: 'text', text: 'Anything else?' }),
    ];
    expect(
      answerSummary(asked, {
        ...answers,
        extra: { values: [], other: 'near a night market' },
      }),
    ).toEqual([
      { id: 'weather', question: 'What weather do you hope for?', answer: 'Sunny, Warm' },
      { id: 'date', question: 'When?', answer: '2026-12-10' },
      { id: 'extra', question: 'Anything else?', answer: 'near a night market' },
    ]);
  });
});

describe('buildProposals', () => {
  const destination = (slug: string, distanceKm: number): ScoredDestination => ({
    slug,
    lat: 0,
    lng: 0,
    countryCode: 'XX',
    climate: { tempMeanC: 24, tempMaxC: 29, precipMm: 30, snowfallCm: 0, sunshineHours: 9 },
    facts: null,
    profile: null,
    distanceKm,
    score: 1,
    weatherScore: 1,
    interestScore: 1,
  });
  const shortlist = [
    destination('rio', 400),
    destination('lima', 3500),
    destination('quito', 4000),
  ];

  test('the model picks and explains: its order and reasons are used', () => {
    const proposals = buildProposals(shortlist, [{ slug: 'lima', reason: 'Warm coast.' }], 6);
    expect(proposals.map((p) => [p.destination.slug, p.reason, p.byModel])).toEqual([
      ['lima', 'Warm coast.', true],
    ]);
  });

  test('without the model the best fits are proposed, with no reason of its own', () => {
    const proposals = buildProposals(shortlist, null, 2);
    expect(proposals.map((p) => [p.destination.slug, p.reason, p.byModel])).toEqual([
      ['rio', null, false],
      ['lima', null, false],
    ]);
  });

  test('a pick the code never offered is ignored', () => {
    const proposals = buildProposals(
      shortlist,
      [
        { slug: 'atlantis', reason: 'Invented.' },
        { slug: 'quito', reason: 'High and sunny.' },
      ],
      6,
    );
    expect(proposals.map((p) => p.destination.slug)).toEqual(['quito']);
  });

  test('the planner asks ten questions in all', () => {
    expect(TOTAL_QUESTIONS).toBe(10);
  });
});

describe('futureTripsFrom', () => {
  test('each ticked destination becomes a future trip with its reason and the planned day', () => {
    expect(
      futureTripsFrom(
        [
          { slug: 'lima', reason: 'Warm coast.' },
          { slug: 'rio', reason: null },
        ],
        '2026-12-10',
      ),
    ).toEqual([
      { citySlug: 'lima', reason: 'Warm coast.', plannedFor: '2026-12-10' },
      { citySlug: 'rio', reason: null, plannedFor: '2026-12-10' },
    ]);
  });

  test('without a planned day the trips have none', () => {
    expect(futureTripsFrom([{ slug: 'rio', reason: null }], null)).toEqual([
      { citySlug: 'rio', reason: null, plannedFor: null },
    ]);
  });
});
