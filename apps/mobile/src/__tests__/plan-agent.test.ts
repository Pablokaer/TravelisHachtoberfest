import i18n from '@/lib/i18n';
import { CORE_QUESTION_IDS, FOLLOW_UP_COUNT, type PlanQuestion } from '@/features/plan/plan-flow';
import { HttpPlanAgent } from '@/features/plan/plan-agent';
import { coreQuestion, fallbackQuestion } from '@/features/plan/questions';

const t = i18n.getFixedT('en');

/** A fetch that answers with one canned response, or fails like a service that is not running. */
class FakeFetch {
  calls: { url: string; body: unknown }[] = [];
  constructor(
    private readonly status: number,
    private readonly reply: unknown,
    private readonly offline = false,
  ) {}
  fetch = async (url: string, init?: RequestInit): Promise<Response> => {
    if (this.offline) throw new TypeError('Failed to fetch');
    this.calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    return { status: this.status, ok: this.status < 400, json: async () => this.reply } as Response;
  };
}

describe('questions (D-081)', () => {
  test('the seven core questions are written in the language of the interface', () => {
    const asked = CORE_QUESTION_IDS.map((id) => coreQuestion(id, t));
    expect(asked.map((q) => q.kind)).toEqual([
      'origin',
      'date',
      'single',
      'single',
      'multi',
      'multi',
      'multi',
    ]);
    expect(asked[3]!.text).toBe('How far from home are you willing to go?');
    expect(asked[4]!.options.map((o) => o.label)).toContain('Snow');
    expect(asked.every((q) => q.source === 'core' && q.allowOther)).toBe(true);
  });

  test('the fallback follow-ups are used when the model cannot write them', () => {
    const asked = Array.from({ length: FOLLOW_UP_COUNT }, (_, i) => fallbackQuestion(i, t));
    expect(asked.map((q) => [q.id, q.kind, q.source])).toEqual([
      ['pace', 'single', 'fallback'],
      ['company', 'single', 'fallback'],
      ['extra', 'text', 'fallback'],
    ]);
  });

  test('a fallback index out of range is an error naming it', () => {
    expect(() => fallbackQuestion(FOLLOW_UP_COUNT, t)).toThrow(/3.*0 to 2/);
  });
});

describe('HttpPlanAgent (D-081)', () => {
  const summary = [{ id: 'weather', question: 'Weather?', answer: 'Sunny' }];

  test('nextQuestion posts the answers so far and maps the model’s question', async () => {
    const http = new FakeFetch(200, {
      question: {
        id: 'ai-4',
        text: 'Which kind of castle?',
        kind: 'single',
        options: [{ value: 'hilltop', label: 'Hilltop' }],
        allow_other: true,
      },
      source: 'ollama',
    });
    const agent = new HttpPlanAgent('http://x/', http.fetch);
    const question = (await agent.nextQuestion(summary, 'en')) as PlanQuestion;
    expect(question).toEqual({
      id: 'ai-4',
      kind: 'single',
      text: 'Which kind of castle?',
      options: [{ value: 'hilltop', label: 'Hilltop' }],
      allowOther: true,
      source: 'ai',
    });
    expect(http.calls[0]).toEqual({
      url: 'http://x/plan/question',
      body: { language: 'en', answers: summary },
    });
  });

  test('nextQuestion is null when the service refuses, is offline or answers nonsense', async () => {
    const refused = new FakeFetch(503, { status: 'failed', message: 'no model' });
    expect(
      await new HttpPlanAgent('http://x', refused.fetch).nextQuestion(summary, 'en'),
    ).toBeNull();
    const offline = new FakeFetch(0, null, true);
    expect(
      await new HttpPlanAgent('http://x', offline.fetch).nextQuestion(summary, 'en'),
    ).toBeNull();
    const nonsense = new FakeFetch(200, { question: { text: 7 } });
    expect(
      await new HttpPlanAgent('http://x', nonsense.fetch).nextQuestion(summary, 'en'),
    ).toBeNull();
  });

  test('rank sends the shortlist and returns the picks with their reasons', async () => {
    const http = new FakeFetch(200, {
      picks: [{ slug: 'lisbon', reason: 'Mild and sunny in December.' }],
      source: 'ollama',
    });
    const candidates = [
      {
        slug: 'lisbon',
        name: 'Lisbon',
        country: 'Portugal',
        distanceKm: 1900,
        facts: { beaches: 12 },
      },
    ];
    const picks = await new HttpPlanAgent('http://x', http.fetch).rank(
      summary,
      candidates,
      'en',
      6,
    );
    expect(picks).toEqual([{ slug: 'lisbon', reason: 'Mild and sunny in December.' }]);
    expect(http.calls[0]!.body).toEqual({
      language: 'en',
      limit: 6,
      answers: summary,
      candidates: [
        {
          slug: 'lisbon',
          name: 'Lisbon',
          country: 'Portugal',
          distance_km: 1900,
          facts: { beaches: 12 },
        },
      ],
    });
  });

  test('rank is null when the service is not there, so the app ranks by score', async () => {
    const offline = new FakeFetch(0, null, true);
    expect(
      await new HttpPlanAgent('http://x', offline.fetch).rank(summary, [], 'en', 6),
    ).toBeNull();
  });
});
