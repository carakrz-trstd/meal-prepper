import type { FastifyInstance, FastifyReply } from 'fastify';
import { isRestriction, type Restriction } from '../../shared/constraints/types';
import { isValidWeekStart } from '../../shared/week';
import type { FieldError } from '../../shared/types';
import type { ConstraintsService } from './constraints.service';
import type { OnlineSearchService } from './search/OnlineSearchService';
import type { SearchSessionStore } from './search/SearchSessionStore';

const bad = (reply: FastifyReply, fields: FieldError[]) => reply.code(400).send({ code: 'VALIDATION', fields });
const isPositive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const absent = (v: unknown) => v === undefined || v === null;
const isIdList = (v: unknown): v is number[] => Array.isArray(v) && v.every((n) => Number.isInteger(n));

function participantBody(body: { name?: unknown; restrictions?: unknown } | undefined): { name: string; restrictions: Restriction[] } | FieldError[] {
  const errors: FieldError[] = [];
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) errors.push({ field: 'name', message: 'Name is required.' });
  const raw = body?.restrictions ?? [];
  if (!Array.isArray(raw) || !raw.every(isRestriction)) errors.push({ field: 'restrictions', message: 'Choose restrictions from the list.' });
  return errors.length > 0 ? errors : { name, restrictions: raw as Restriction[] };
}

/** Limits are positive numbers or absent/null. */
function limitErrors(body: Record<string, unknown>): FieldError[] {
  const errors: FieldError[] = [];
  for (const key of ['calorieLimit', 'budgetLimit', 'timeLimit']) {
    if (!absent(body[key]) && !isPositive(body[key])) errors.push({ field: key, message: 'The limit must be a number greater than 0.' });
  }
  return errors;
}

interface SuggestBody {
  weekStart: string;
  participantIds: number[];
  servings: number;
  calorieLimit?: number | null;
  budgetLimit?: number | null;
  timeLimit?: number | null;
}

/** Validation shared by the library and the online suggestion requests. */
function parseSuggestBody(body: Record<string, unknown> | undefined): SuggestBody | FieldError[] {
  const b = body ?? {};
  const errors = limitErrors(b);
  if (typeof b.weekStart !== 'string' || !isValidWeekStart(b.weekStart)) errors.push({ field: 'weekStart', message: 'The week must start on a Monday (YYYY-MM-DD).' });
  if (!isIdList(b.participantIds ?? [])) errors.push({ field: 'participantIds', message: 'participantIds must be a list of ids.' });
  const servings = b.servings;
  if (typeof servings !== 'number' || !Number.isInteger(servings) || servings < 1 || servings > 20) {
    errors.push({ field: 'servings', message: 'Servings must be a whole number from 1 to 20.' });
  }
  if (errors.length > 0) return errors;
  return {
    weekStart: b.weekStart as string,
    participantIds: (b.participantIds as number[] | undefined) ?? [],
    servings: servings as number,
    calorieLimit: b.calorieLimit as number | null | undefined,
    budgetLimit: b.budgetLimit as number | null | undefined,
    timeLimit: b.timeLimit as number | null | undefined,
  };
}

export interface OnlineRoutes {
  service: OnlineSearchService;
  store: SearchSessionStore;
}

export function registerConstraintsRoutes(app: FastifyInstance, svc: ConstraintsService, online?: OnlineRoutes): void {
  // --- participants (AC-7, AC-20)
  app.get('/api/participants', async () => svc.participants.list());

  app.post<{ Body: { name?: unknown; restrictions?: unknown } }>('/api/participants', async (req, reply) => {
    const parsed = participantBody(req.body);
    if (Array.isArray(parsed)) return bad(reply, parsed);
    return reply.code(201).send(svc.participants.create(parsed.name, parsed.restrictions));
  });

  app.put<{ Params: { id: string }; Body: { name?: unknown; restrictions?: unknown } }>('/api/participants/:id', async (req, reply) => {
    const parsed = participantBody(req.body);
    if (Array.isArray(parsed)) return bad(reply, parsed);
    const updated = svc.participants.update(Number(req.params.id), parsed.name, parsed.restrictions);
    return updated ?? reply.code(404).send({ code: 'NOT_FOUND' });
  });

  app.delete<{ Params: { id: string } }>('/api/participants/:id', async (req, reply) =>
    svc.participants.delete(Number(req.params.id)) ? reply.code(204).send() : reply.code(404).send({ code: 'NOT_FOUND' }),
  );

  // --- blacklist (AC-6)
  app.get('/api/blacklist', async () => svc.blacklist.list());

  app.post<{ Body: { term?: unknown } }>('/api/blacklist', async (req, reply) => {
    const term = typeof req.body?.term === 'string' ? req.body.term.trim() : '';
    if (!term) return bad(reply, [{ field: 'term', message: 'Enter an ingredient.' }]);
    const before = svc.blacklist.list().length;
    const item = svc.blacklist.add(term);
    return reply.code(svc.blacklist.list().length > before ? 201 : 200).send(item);
  });

  app.delete<{ Params: { id: string } }>('/api/blacklist/:id', async (req, reply) =>
    svc.blacklist.remove(Number(req.params.id)) ? reply.code(204).send() : reply.code(404).send({ code: 'NOT_FOUND' }),
  );

  // --- last suggestion request (AC-26)
  app.get('/api/suggestion-prefs', async () => svc.getPrefs());

  app.put<{ Body: Record<string, unknown> }>('/api/suggestion-prefs', async (req, reply) => {
    const body = req.body ?? {};
    const errors = limitErrors(body);
    if (!absent(body.participantIds) && !isIdList(body.participantIds)) errors.push({ field: 'participantIds', message: 'participantIds must be a list of ids.' });
    if (errors.length > 0) return bad(reply, errors);
    svc.prefs.save({
      calorieLimit: (body.calorieLimit as number | null | undefined) ?? null,
      budgetLimit: (body.budgetLimit as number | null | undefined) ?? null,
      timeLimit: (body.timeLimit as number | null | undefined) ?? null,
      participantIds: (body.participantIds as number[] | undefined) ?? [],
    });
    return svc.getPrefs();
  });

  // --- library suggestions (AC-1..AC-6, AC-9, AC-11, AC-12, AC-14, AC-22)
  app.post<{ Body: Record<string, unknown> }>('/api/suggestions', async (req, reply) => {
    const parsed = parseSuggestBody(req.body);
    if (Array.isArray(parsed)) return bad(reply, parsed);
    return svc.suggest(parsed);
  });

  // --- online search, only when asked for (AC-16..AC-19, AC-23, AC-27)
  if (online) {
    const { service, store } = online;

    app.post<{ Body: Record<string, unknown> }>('/api/suggestions/online', async (req, reply) => {
      const parsed = parseSuggestBody(req.body);
      if (Array.isArray(parsed)) return bad(reply, parsed);
      const searchId = service.start({
        limits: { calorieLimit: parsed.calorieLimit, budgetLimit: parsed.budgetLimit, timeLimit: parsed.timeLimit },
        participantIds: parsed.participantIds,
        servings: parsed.servings,
      });
      return reply.code(202).send({ searchId });
    });

    // Server-Sent Events: the events so far are replayed, new ones follow, the stream ends with done/failed.
    app.get<{ Params: { searchId: string } }>('/api/suggestions/online/:searchId/events', (req, reply) => {
      const session = store.get(req.params.searchId);
      if (!session) return reply.code(404).send({ code: 'NOT_FOUND' });
      reply.hijack();
      const res = reply.raw;
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' });
      let off: (() => void) | undefined;
      const close = () => {
        off?.();
        if (!res.writableEnded) res.end();
      };
      off = store.subscribe(session.id, (event) => {
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
        if (event.type !== 'candidate') close();
      });
      req.raw.on('close', close);
    });

    app.get<{ Params: { searchId: string; candidateId: string } }>('/api/suggestions/online/:searchId/candidates/:candidateId', async (req, reply) => {
      const c = store.getCandidate(req.params.searchId, req.params.candidateId);
      return c ? { candidateId: req.params.candidateId, match: c.match, draft: c.draft } : reply.code(404).send({ code: 'NOT_FOUND' });
    });
  }

  // --- dietary and blacklist check when planning a meal manually (AC-8, AC-11, AC-13)
  app.post<{ Body: { mealId?: unknown; participantIds?: unknown } }>('/api/meals/check', async (req, reply) => {
    const { mealId, participantIds } = req.body ?? {};
    if (typeof mealId !== 'number' || !Number.isInteger(mealId) || !isIdList(participantIds ?? [])) {
      return bad(reply, [{ field: 'body', message: 'mealId and participantIds are required.' }]);
    }
    const result = svc.checkLibraryMeal(mealId, (participantIds as number[] | undefined) ?? []);
    return result ?? reply.code(404).send({ code: 'NOT_FOUND' });
  });

  // --- warnings in the plan view (AC-25)
  app.get<{ Querystring: { weekStart?: string } }>('/api/plan-warnings', async (req, reply) => {
    const week = req.query.weekStart;
    if (!week || !isValidWeekStart(week)) return bad(reply, [{ field: 'weekStart', message: 'The week must start on a Monday (YYYY-MM-DD).' }]);
    return svc.planWarnings(week);
  });
}
