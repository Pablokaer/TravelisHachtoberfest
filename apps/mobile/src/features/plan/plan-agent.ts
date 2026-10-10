// Client of the planner's two model endpoints on the local city-builder service (D-081): it writes
// the follow-up questions and ranks the shortlist with a reason for each place. Both answers are
// optional: when the service or the model is not there the app falls back to its fixed questions
// and to ranking by score.
import type { PlanQuestion, RankedPick } from './plan-flow';

export type AnswerSummary = { id: string; question: string; answer: string };

/** A shortlisted city as the model reads it: facts only, never invented numbers. */
export type RankCandidate = {
  slug: string;
  name: string;
  country: string;
  distanceKm: number;
  facts: Record<string, number | null>;
};

export interface PlanAgent {
  /** The next question written by the model; null when it cannot be had. */
  nextQuestion(answers: AnswerSummary[], language: string): Promise<PlanQuestion | null>;
  /** The model's picks with reasons; null when it cannot be had. */
  rank(
    answers: AnswerSummary[],
    candidates: RankCandidate[],
    language: string,
    limit: number,
  ): Promise<RankedPick[] | null>;
}

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

type QuestionWire = {
  id?: unknown;
  text?: unknown;
  kind?: unknown;
  options?: { value?: unknown; label?: unknown }[];
  allow_other?: unknown;
};

const KINDS = ['single', 'multi', 'text'] as const;

function questionFromWire(wire: QuestionWire | undefined): PlanQuestion | null {
  if (!wire || typeof wire.id !== 'string' || typeof wire.text !== 'string') return null;
  const kind = KINDS.find((k) => k === wire.kind);
  if (!kind) return null;
  const options = (wire.options ?? []).flatMap((o) =>
    typeof o.value === 'string' && typeof o.label === 'string'
      ? [{ value: o.value, label: o.label }]
      : [],
  );
  return {
    id: wire.id,
    kind,
    text: wire.text,
    options,
    allowOther: wire.allow_other !== false,
    source: 'ai',
  };
}

/**
 * @example const agent = new HttpPlanAgent('http://127.0.0.1:8787');
 * const next = await agent.nextQuestion(summary, 'en'); // null without the service
 */
export class HttpPlanAgent implements PlanAgent {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly http: FetchFn = (url, init) => fetch(url, init),
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  /** The service's JSON answer, or null for any refusal, outage or bad answer. */
  private async post<T>(path: string, body: unknown): Promise<T | null> {
    try {
      const response = await this.http(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return response.ok ? ((await response.json()) as T) : null;
    } catch {
      return null;
    }
  }

  async nextQuestion(answers: AnswerSummary[], language: string): Promise<PlanQuestion | null> {
    const wire = await this.post<{ question?: QuestionWire }>('/plan/question', {
      language,
      answers,
    });
    return questionFromWire(wire?.question);
  }

  async rank(
    answers: AnswerSummary[],
    candidates: RankCandidate[],
    language: string,
    limit: number,
  ): Promise<RankedPick[] | null> {
    const wire = await this.post<{ picks?: { slug?: unknown; reason?: unknown }[] }>('/plan/rank', {
      language,
      limit,
      answers,
      candidates: candidates.map(({ distanceKm, ...rest }) => ({
        ...rest,
        distance_km: distanceKm,
      })),
    });
    const picks = (wire?.picks ?? []).flatMap((p) =>
      typeof p.slug === 'string' && typeof p.reason === 'string'
        ? [{ slug: p.slug, reason: p.reason }]
        : [],
    );
    return picks.length > 0 ? picks : null;
  }
}
