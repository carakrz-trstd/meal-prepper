import type { FastifyInstance } from 'fastify';
import { buildApp, type AppOptions } from '../../../src/server/http/app';
import { fixedClock, freshDb, seedMeal, THIS_WEEK } from '../../helpers';
import type { Db } from '../../../src/server/db/open';
import type { Restriction } from '../../../src/shared/constraints/types';

export { THIS_WEEK, seedMeal };

export async function makeApp(over: Partial<AppOptions> = {}): Promise<{ app: FastifyInstance; db: Db }> {
  const db = freshDb();
  const app = await buildApp({ db, clock: fixedClock(), ...over });
  return { app, db };
}

export async function addParticipant(app: FastifyInstance, name: string, restrictions: Restriction[] = []): Promise<{ id: number; name: string; restrictions: Restriction[] }> {
  const res = await app.inject({ method: 'POST', url: '/api/participants', payload: { name, restrictions } });
  if (res.statusCode !== 201) throw new Error(`participant not created: ${res.body}`);
  return res.json();
}

export const meal = (db: Db, name: string, ingredients: string[], over: Parameters<typeof seedMeal>[1] = {}) =>
  seedMeal(db, { name, ingredients: ingredients.map((n) => ({ name: n, quantity: 100, unit: 'g' as const })), ...over });
