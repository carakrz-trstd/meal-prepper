import type { FastifyInstance, FastifyReply } from 'fastify';
import type { MealService, SaveResult } from '../services/MealService';
import type { MealInput } from '../../shared/types';

type MealBody = MealInput & { allowDuplicateName?: boolean };

function send(reply: FastifyReply, result: SaveResult, okStatus: number) {
  switch (result.kind) {
    case 'ok':
      return reply.code(okStatus).send(result.meal);
    case 'invalid':
      return reply.code(422).send({ code: 'VALIDATION', fields: result.errors });
    case 'duplicate':
      return reply.code(409).send({ code: 'DUPLICATE_NAME', message: 'A meal with this name already exists.' });
    case 'not_found':
      return reply.code(404).send({ code: 'NOT_FOUND' });
  }
}

export function registerMealRoutes(app: FastifyInstance, meals: MealService): void {
  app.get<{ Querystring: { favourites?: string } }>('/api/meals', async (req) =>
    meals.list({ favouritesOnly: req.query.favourites === 'true' }),
  );

  app.get<{ Params: { id: string } }>('/api/meals/:id', async (req, reply) => {
    const meal = meals.get(Number(req.params.id));
    return meal ?? reply.code(404).send({ code: 'NOT_FOUND' });
  });

  app.post<{ Body: MealBody }>('/api/meals', async (req, reply) => {
    const { allowDuplicateName, ...input } = req.body ?? ({} as MealBody);
    return send(reply, meals.create(input as MealInput, { allowDuplicateName }), 201);
  });

  app.put<{ Params: { id: string }; Body: MealBody }>('/api/meals/:id', async (req, reply) => {
    const { allowDuplicateName, ...input } = req.body ?? ({} as MealBody);
    return send(reply, meals.update(Number(req.params.id), input as MealInput, { allowDuplicateName }), 200);
  });

  app.delete<{ Params: { id: string } }>('/api/meals/:id', async (req, reply) => {
    return meals.delete(Number(req.params.id))
      ? reply.code(204).send()
      : reply.code(404).send({ code: 'NOT_FOUND' });
  });

  app.put<{ Params: { id: string }; Body: { value?: boolean } }>('/api/meals/:id/favourite', async (req, reply) => {
    const meal = meals.setFavourite(Number(req.params.id), req.body?.value === true);
    return meal ?? reply.code(404).send({ code: 'NOT_FOUND' });
  });
}
