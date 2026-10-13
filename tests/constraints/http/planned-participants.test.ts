import { describe, it, expect } from 'vitest';
import { makeApp, addParticipant, meal, THIS_WEEK } from './support';

const links = (db: Awaited<ReturnType<typeof makeApp>>['db']) =>
  (db.prepare('SELECT participant_id AS p FROM planned_meal_participant ORDER BY participant_id').all() as { p: number }[]).map((r) => r.p);

describe('participants stored with a planned meal (T-14, AC-25, FR-19)', () => {
  it('PUT with participantIds stores the links', async () => {
    const { app, db } = await makeApp();
    const a = await addParticipant(app, 'Anna');
    const b = await addParticipant(app, 'Ben');
    const m = meal(db, 'Soup', ['Carrot']);
    const res = await app.inject({ method: 'PUT', url: `/api/plan/${THIS_WEEK}/days/2`, payload: { mealId: m, servings: 2, participantIds: [a.id, b.id] } });
    expect(res.statusCode).toBe(200);
    expect(links(db)).toEqual([a.id, b.id]);
  });

  it('a replace PUT rewrites the links; a servings-only PATCH and a PUT without participantIds leave them untouched', async () => {
    const { app, db } = await makeApp();
    const a = await addParticipant(app, 'Anna');
    const b = await addParticipant(app, 'Ben');
    const m1 = meal(db, 'One', ['Carrot']);
    const m2 = meal(db, 'Two', ['Rice']);
    await app.inject({ method: 'PUT', url: `/api/plan/${THIS_WEEK}/days/2`, payload: { mealId: m1, servings: 2, participantIds: [a.id, b.id] } });
    await app.inject({ method: 'PATCH', url: `/api/plan/${THIS_WEEK}/days/2`, payload: { servings: 5 } });
    expect(links(db)).toEqual([a.id, b.id]);
    await app.inject({ method: 'PUT', url: `/api/plan/${THIS_WEEK}/days/2`, payload: { mealId: m2, servings: 3, replace: true } });
    expect(links(db)).toEqual([a.id, b.id]);
    await app.inject({ method: 'PUT', url: `/api/plan/${THIS_WEEK}/days/2`, payload: { mealId: m1, servings: 3, replace: true, participantIds: [b.id] } });
    expect(links(db)).toEqual([b.id]);
    await app.inject({ method: 'PUT', url: `/api/plan/${THIS_WEEK}/days/2`, payload: { mealId: m1, servings: 3, replace: true, participantIds: [] } });
    expect(links(db)).toEqual([]);
  });

  it('removing the day removes the links (FK cascade)', async () => {
    const { app, db } = await makeApp();
    const a = await addParticipant(app, 'Anna');
    const m = meal(db, 'Soup', ['Carrot']);
    await app.inject({ method: 'PUT', url: `/api/plan/${THIS_WEEK}/days/2`, payload: { mealId: m, servings: 2, participantIds: [a.id] } });
    await app.inject({ method: 'DELETE', url: `/api/plan/${THIS_WEEK}/days/2` });
    expect(links(db)).toEqual([]);
  });

  it('an unknown participant id -> 400 and nothing is planned', async () => {
    const { app, db } = await makeApp();
    const m = meal(db, 'Soup', ['Carrot']);
    const res = await app.inject({ method: 'PUT', url: `/api/plan/${THIS_WEEK}/days/2`, payload: { mealId: m, servings: 2, participantIds: [999] } });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('INVALID_PARTICIPANT');
    const view = (await app.inject({ method: 'GET', url: `/api/plan/${THIS_WEEK}` })).json();
    expect(view.days[1].entry).toBeNull();
  });

  it('a malformed participantIds value -> 400', async () => {
    const { app, db } = await makeApp();
    const m = meal(db, 'Soup', ['Carrot']);
    const res = await app.inject({ method: 'PUT', url: `/api/plan/${THIS_WEEK}/days/2`, payload: { mealId: m, servings: 2, participantIds: 'all' } });
    expect(res.statusCode).toBe(400);
  });

  it('deleting a participant keeps the planned meal and its servings', async () => {
    const { app, db } = await makeApp();
    const a = await addParticipant(app, 'Anna');
    const m = meal(db, 'Soup', ['Carrot']);
    await app.inject({ method: 'PUT', url: `/api/plan/${THIS_WEEK}/days/2`, payload: { mealId: m, servings: 4, participantIds: [a.id] } });
    await app.inject({ method: 'DELETE', url: `/api/participants/${a.id}` });
    const view = (await app.inject({ method: 'GET', url: `/api/plan/${THIS_WEEK}` })).json();
    expect(view.days[1].entry).toMatchObject({ mealName: 'Soup', servings: 4 });
    expect(links(db)).toEqual([]);
  });
});
