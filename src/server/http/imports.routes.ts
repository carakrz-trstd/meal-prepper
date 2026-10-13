import type { FastifyInstance } from 'fastify';
import type { MealService } from '../services/MealService';
import { ImportService, type ImportDeps } from '../import/ImportService';
import { RecipeFetcher } from '../import/RecipeFetcher';
import { OpenFoodFactsNutritionProvider } from '../import/estimators/OpenFoodFactsNutritionProvider';
import { ReweDePriceProvider } from '../import/estimators/ReweDePriceProvider';

export type { ImportDeps };

/** Production wiring; base URLs and the deadline can be overridden by env (used by the e2e stubs). */
export function defaultImportDeps(env: NodeJS.ProcessEnv = process.env): ImportDeps {
  return {
    fetcher: new RecipeFetcher(),
    nutrition: new OpenFoodFactsNutritionProvider({
      baseUrl: env.NUTRITION_BASE_URL,
      minIntervalMs: env.NUTRITION_BASE_URL ? 0 : undefined,
    }),
    prices: new ReweDePriceProvider({
      baseUrl: env.PRICE_BASE_URL,
      minIntervalMs: env.PRICE_BASE_URL ? 0 : undefined,
    }),
    deadlineMs: Number(env.IMPORT_DEADLINE_MS) > 0 ? Number(env.IMPORT_DEADLINE_MS) : 30000,
  };
}

/** Import endpoints (AD-17): POST starts a job, GET reports its status. Nothing is saved here (AC-4). */
export function registerImportRoutes(
  app: FastifyInstance,
  _meals: MealService,
  overrides: Partial<ImportDeps> = {},
): ImportService {
  const service = new ImportService({ ...defaultImportDeps(), ...overrides });

  app.post<{ Body: { url?: unknown } }>('/api/imports', async (req, reply) => {
    const url = req.body?.url;
    let ok = typeof url === 'string';
    if (ok) {
      try {
        const u = new URL(url as string);
        ok = u.protocol === 'http:' || u.protocol === 'https:';
      } catch {
        ok = false;
      }
    }
    if (!ok) return reply.code(422).send({ code: 'INVALID_URL', message: 'Enter a valid web address starting with http or https.' });
    return reply.code(202).send({ jobId: service.start(url as string) });
  });

  app.get<{ Params: { jobId: string } }>('/api/imports/:jobId', async (req, reply) => {
    const status = service.get(req.params.jobId);
    return status ?? reply.code(404).send({ code: 'NOT_FOUND' });
  });

  return service;
}
