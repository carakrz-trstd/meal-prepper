import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import type { Db } from '../db/open';
import { MealRepository } from '../db/MealRepository';
import { MealService } from '../services/MealService';
import { registerMealRoutes } from './meals.routes';
import { registerImportRoutes, type ImportDeps } from './imports.routes';
import { registerPlanRoutes } from '../plan/plan.routes';
import { PlanService } from '../plan/plan.service';
import { clockFromEnv, type Clock } from '../plan/clock';
import { ConstraintsService } from '../constraints/constraints.service';
import { registerConstraintsRoutes } from '../constraints/constraints.routes';
import { OnlineSearchService } from '../constraints/search/OnlineSearchService';
import { SearchSessionStore } from '../constraints/search/SearchSessionStore';
import { defaultSearchSetup, type SearchSetup } from '../constraints/search/defaults';

export interface AppOptions {
  db: Db;
  /** Import dependencies (fetcher, providers, deadline); defaults are used when omitted. */
  importDeps?: Partial<ImportDeps>;
  /** Directory of the built client to serve, if any. */
  clientDir?: string;
  /** Source of "today" for the weekly plan; defaults to APP_FIXED_DATE or the system clock. */
  clock?: Clock;
  /** Online recipe search (Epic 3): search engine, page importer and deadline; production defaults when omitted. */
  search?: Partial<SearchSetup>;
}

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const meals = new MealService(new MealRepository(opts.db));

  registerMealRoutes(app, meals);
  const constraints = new ConstraintsService(opts.db);
  registerPlanRoutes(app, new PlanService(opts.db, opts.clock ?? clockFromEnv(), constraints.planned));
  const search = { ...defaultSearchSetup(), ...opts.search };
  const store = new SearchSessionStore();
  const mealRepo = new MealRepository(opts.db);
  const onlineService = new OnlineSearchService({
    adapter: search.adapter,
    parse: search.parse,
    deadlineMs: search.deadlineMs,
    store,
    context: (ids) => constraints.context(ids),
    libraryUrls: () => mealRepo.sourceUrls(),
  });
  registerConstraintsRoutes(app, constraints, { service: onlineService, store });
  const imports = registerImportRoutes(app, meals, opts.importDeps);
  app.addHook('onClose', async () => imports.close());

  if (opts.clientDir && fs.existsSync(opts.clientDir)) {
    await app.register(fastifyStatic, { root: opts.clientDir });
    app.setNotFoundHandler((req, reply) => {
      if (req.raw.url?.startsWith('/api/')) return reply.code(404).send({ code: 'NOT_FOUND' });
      return reply.sendFile('index.html');
    });
  }
  return app;
}
