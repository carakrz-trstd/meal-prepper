import { randomUUID } from 'node:crypto';
import type { MealDraft } from '../../../shared/types';
import type { SuggestionMatch } from '../../../shared/constraints/types';

export type OnlineEvent =
  | { type: 'candidate'; candidate: SuggestionMatch }
  | { type: 'done'; found: number }
  | { type: 'failed'; message: string };

export interface OnlineCandidate {
  match: SuggestionMatch;
  draft: MealDraft;
}

export interface OnlineSession {
  id: string;
  status: 'running' | 'done' | 'failed';
  events: OnlineEvent[];
  createdAt: number;
}

const DEFAULT_TTL_MS = 30 * 60 * 1000;

/** In-memory online search sessions with a TTL (AD-8): candidates are throwaway and never stored in SQLite. */
export class SearchSessionStore {
  private readonly sessions = new Map<string, OnlineSession>();
  private readonly candidates = new Map<string, Map<string, OnlineCandidate>>();
  private readonly listeners = new Map<string, Set<(e: OnlineEvent) => void>>();
  private readonly ttl: number;

  constructor(opts: { ttlMs?: number } = {}) {
    this.ttl = opts.ttlMs ?? DEFAULT_TTL_MS;
  }

  private prune(): void {
    const now = Date.now();
    for (const [id, s] of this.sessions) {
      if (now - s.createdAt > this.ttl) {
        this.sessions.delete(id);
        this.candidates.delete(id);
        this.listeners.delete(id);
      }
    }
  }

  create(): OnlineSession {
    this.prune();
    const session: OnlineSession = { id: randomUUID(), status: 'running', events: [], createdAt: Date.now() };
    this.sessions.set(session.id, session);
    this.candidates.set(session.id, new Map());
    return session;
  }

  get(id: string): OnlineSession | undefined {
    this.prune();
    return this.sessions.get(id);
  }

  getCandidate(sessionId: string, candidateId: string): OnlineCandidate | undefined {
    this.prune();
    return this.candidates.get(sessionId)?.get(candidateId);
  }

  emit(id: string, event: OnlineEvent): void {
    const session = this.sessions.get(id);
    if (!session) return;
    session.events.push(event);
    if (event.type === 'done') session.status = 'done';
    if (event.type === 'failed') session.status = 'failed';
    for (const l of this.listeners.get(id) ?? []) l(event);
  }

  addCandidate(id: string, candidate: OnlineCandidate): void {
    const id2 = candidate.match.candidateId;
    if (!this.sessions.has(id) || !id2) return;
    this.candidates.get(id)!.set(id2, candidate);
    this.emit(id, { type: 'candidate', candidate: candidate.match });
  }

  /** Replays the events so far, then delivers new ones. Returns an unsubscribe function, or undefined for unknown sessions. */
  subscribe(id: string, listener: (e: OnlineEvent) => void): (() => void) | undefined {
    const session = this.get(id);
    if (!session) return undefined;
    for (const e of session.events) listener(e);
    const set = this.listeners.get(id) ?? new Set();
    set.add(listener);
    this.listeners.set(id, set);
    return () => set.delete(listener);
  }
}
