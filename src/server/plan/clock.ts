import { localDateString } from '../../shared/week';

/** Source of "today" as YYYY-MM-DD; injectable so the current week and past days are testable (AD-13). */
export interface Clock {
  today(): string;
}

export const systemClock: Clock = { today: () => localDateString(new Date()) };

/** `APP_FIXED_DATE=YYYY-MM-DD` pins the date (used by the e2e run); otherwise the system clock. */
export function clockFromEnv(env: NodeJS.ProcessEnv = process.env): Clock {
  const fixed = env.APP_FIXED_DATE;
  return fixed && /^\d{4}-\d{2}-\d{2}$/.test(fixed) ? { today: () => fixed } : systemClock;
}
