import type { FieldError, MealDraft } from '../../shared/types';
import type { MealCheckResult, Participant, PlanWarning, Restriction, SuggestionMatch, SuggestionPrefs, SuggestionResult } from '../../shared/constraints/types';

export type ParticipantResult = { kind: 'ok'; participant: Participant } | { kind: 'invalid'; fields: FieldError[] };

export interface BlacklistItem {
  id: number;
  term: string;
}

export interface SuggestBody {
  weekStart: string;
  calorieLimit: number | null;
  budgetLimit: number | null;
  timeLimit: number | null;
  participantIds: number[];
  servings: number;
}

export interface OnlineHandlers {
  onCandidate(match: SuggestionMatch): void;
  onDone(found: number): void;
  onFailed(message: string): void;
}

async function request(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new Error('Could not reach the server. Is the app still running?');
  }
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

/** Turns an error response into a readable Error (first validation message, else the status). */
async function fail(res: Response): Promise<never> {
  let message = `The server answered with status ${res.status}.`;
  try {
    const body = (await res.json()) as { fields?: FieldError[]; message?: string };
    message = body.fields?.[0]?.message ?? body.message ?? message;
  } catch {
    /* no JSON body */
  }
  throw new Error(message);
}

async function ok<T>(res: Response): Promise<T> {
  if (!res.ok) return fail(res);
  return (await res.json()) as T;
}

async function participantCall(url: string, method: 'POST' | 'PUT', name: string, restrictions: Restriction[]): Promise<ParticipantResult> {
  const res = await request(url, json(method, { name, restrictions }));
  if (res.status === 400) return { kind: 'invalid', fields: ((await res.json()) as { fields: FieldError[] }).fields };
  return { kind: 'ok', participant: await ok<Participant>(res) };
}

export const constraintsApi = {
  async listParticipants(): Promise<Participant[]> {
    return ok(await request('/api/participants'));
  },
  createParticipant: (name: string, restrictions: Restriction[]) => participantCall('/api/participants', 'POST', name, restrictions),
  updateParticipant: (id: number, name: string, restrictions: Restriction[]) => participantCall(`/api/participants/${id}`, 'PUT', name, restrictions),
  async deleteParticipant(id: number): Promise<void> {
    const res = await request(`/api/participants/${id}`, { method: 'DELETE' });
    if (res.status !== 204 && res.status !== 404) await fail(res);
  },

  async listBlacklist(): Promise<BlacklistItem[]> {
    return ok(await request('/api/blacklist'));
  },
  async addBlacklist(term: string): Promise<BlacklistItem> {
    return ok(await request('/api/blacklist', json('POST', { term })));
  },
  async removeBlacklist(id: number): Promise<void> {
    const res = await request(`/api/blacklist/${id}`, { method: 'DELETE' });
    if (res.status !== 204 && res.status !== 404) await fail(res);
  },

  async getPrefs(): Promise<SuggestionPrefs> {
    return ok(await request('/api/suggestion-prefs'));
  },
  async suggest(body: SuggestBody): Promise<SuggestionResult> {
    return ok(await request('/api/suggestions', json('POST', body)));
  },

  async startOnline(body: SuggestBody): Promise<{ searchId: string }> {
    return ok(await request('/api/suggestions/online', json('POST', body)));
  },
  /** Opens the event stream of an online search; returns a function that closes it. */
  openOnlineEvents(searchId: string, handlers: OnlineHandlers): () => void {
    const source = new EventSource(`/api/suggestions/online/${searchId}/events`);
    const parse = (e: MessageEvent) => JSON.parse(e.data as string) as { candidate?: SuggestionMatch; found?: number; message?: string };
    source.addEventListener('candidate', (e) => handlers.onCandidate(parse(e as MessageEvent).candidate!));
    source.addEventListener('done', (e) => {
      source.close();
      handlers.onDone(parse(e as MessageEvent).found ?? 0);
    });
    source.addEventListener('failed', (e) => {
      source.close();
      handlers.onFailed(parse(e as MessageEvent).message ?? 'The online search failed or found nothing.');
    });
    // a dropped connection ends the search for the user; the library matches stay usable
    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) return;
      source.close();
      handlers.onFailed('The online search failed or found nothing.');
    };
    return () => source.close();
  },
  async getCandidate(searchId: string, candidateId: string): Promise<{ candidateId: string; match: SuggestionMatch; draft: MealDraft }> {
    const res = await request(`/api/suggestions/online/${searchId}/candidates/${candidateId}`);
    if (res.status === 404) throw new Error('This search result is no longer available. Search again.');
    return ok(res);
  },

  async checkMeal(mealId: number, participantIds: number[]): Promise<MealCheckResult> {
    return ok(await request('/api/meals/check', json('POST', { mealId, participantIds })));
  },
  async planWarnings(weekStart: string): Promise<PlanWarning[]> {
    return ok(await request(`/api/plan-warnings?weekStart=${weekStart}`));
  },
};
