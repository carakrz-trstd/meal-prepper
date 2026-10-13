import type { PlanErrorCode } from '../../shared/plan-types';

const STATUS: Record<PlanErrorCode, number> = {
  INVALID_WEEK: 400,
  WEEK_IN_PAST: 400,
  INVALID_DAY: 400,
  INVALID_SERVINGS: 400,
  MEAL_NOT_FOUND: 404,
  DAY_EMPTY: 404,
  ENTRY_NOT_FOUND: 404,
  INVALID_PARTICIPANT: 400,
  DAY_OCCUPIED: 409,
  MEAL_ALREADY_PLANNED: 409,
};

const MESSAGE: Record<PlanErrorCode, string> = {
  INVALID_WEEK: 'The week must start on a Monday (YYYY-MM-DD).',
  WEEK_IN_PAST: 'Weeks before the current week cannot be planned.',
  INVALID_DAY: 'The day must be 1 (Monday) to 7 (Sunday).',
  INVALID_SERVINGS: 'Servings must be a whole number from 1 to 20.',
  MEAL_NOT_FOUND: 'This meal does not exist.',
  DAY_EMPTY: 'Nothing is planned on this day.',
  ENTRY_NOT_FOUND: 'This shopping list entry does not exist.',
  INVALID_PARTICIPANT: 'participantIds must list existing participants.',
  DAY_OCCUPIED: 'This day already has a meal.',
  MEAL_ALREADY_PLANNED: 'This meal is already planned on another day of this week.',
};

export class PlanError extends Error {
  readonly status: number;
  constructor(
    readonly code: PlanErrorCode,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(MESSAGE[code]);
    this.name = 'PlanError';
    this.status = STATUS[code];
  }
}
