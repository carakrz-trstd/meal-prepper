import type { FastifyInstance, FastifyReply } from 'fastify';
import { PlanError, type PlanService } from './plan.service';

/** Plan API (AD-10): every mutation answers with the full week view so the client replaces its state. */
export function registerPlanRoutes(app: FastifyInstance, plan: PlanService): void {
  function run<T>(reply: FastifyReply, fn: () => T) {
    try {
      return fn();
    } catch (e) {
      if (e instanceof PlanError) return reply.code(e.status).send({ code: e.code, message: e.message, ...e.extra });
      throw e;
    }
  }
  const day = (p: { day: string }) => Number(p.day);

  app.get<{ Params: { mealId: string } }>('/api/plan/usage/:mealId', async (req, reply) =>
    run(reply, () => plan.usage(Number(req.params.mealId))),
  );

  app.get<{ Params: { weekStart: string } }>('/api/plan/:weekStart', async (req, reply) =>
    run(reply, () => plan.getWeek(req.params.weekStart)),
  );

  app.put<{
    Params: { weekStart: string; day: string };
    Body: { mealId?: number; servings?: unknown; replace?: boolean; participantIds?: unknown };
  }>('/api/plan/:weekStart/days/:day', async (req, reply) => {
    const ids = req.body?.participantIds;
    if (ids !== undefined && !(Array.isArray(ids) && ids.every((n) => Number.isInteger(n)))) {
      return reply.code(400).send({ code: 'INVALID_PARTICIPANT', message: 'participantIds must be a list of participant ids.' });
    }
    return run(reply, () =>
      plan.planDay(req.params.weekStart, day(req.params), {
        mealId: Number(req.body?.mealId),
        servings: req.body?.servings as number,
        replace: req.body?.replace === true,
        participantIds: ids as number[] | undefined,
      }),
    );
  });

  app.patch<{ Params: { weekStart: string; day: string }; Body: { servings?: unknown } }>(
    '/api/plan/:weekStart/days/:day',
    async (req, reply) => run(reply, () => plan.changeServings(req.params.weekStart, day(req.params), req.body?.servings as number)),
  );

  app.delete<{ Params: { weekStart: string; day: string } }>('/api/plan/:weekStart/days/:day', async (req, reply) =>
    run(reply, () => plan.removeDay(req.params.weekStart, day(req.params))),
  );

  app.put<{ Params: { weekStart: string }; Body: { entryId?: string; ticked?: boolean } }>('/api/plan/:weekStart/ticks', async (req, reply) =>
    run(reply, () => plan.setTick(req.params.weekStart, String(req.body?.entryId ?? ''), req.body?.ticked === true)),
  );
}
