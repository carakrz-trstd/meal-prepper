/** Weeks are identified by the ISO date (YYYY-MM-DD) of their Monday; days are 1 (Mon) to 7 (Sun). UTC arithmetic avoids time-zone drift. */

const DAY_MS = 86_400_000;
const NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function parse(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function format(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function mondayOf(date: string): string {
  const d = parse(date);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return format(new Date(d.getTime() - dow * DAY_MS));
}

export function addWeeks(weekStart: string, n: number): string {
  return format(new Date(parse(weekStart).getTime() + n * 7 * DAY_MS));
}

export function dayDate(weekStart: string, day: number): string {
  return format(new Date(parse(weekStart).getTime() + (day - 1) * DAY_MS));
}

export function isValidWeekStart(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = parse(value);
  return !Number.isNaN(d.getTime()) && format(d) === value && d.getUTCDay() === 1;
}

export function compareWeeks(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The local calendar date of a Date object as YYYY-MM-DD (what "today" means for the user). */
export function localDateString(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function weekdayName(day: number): string {
  return NAMES[day - 1];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "12 Oct 2026" (fixed English format, independent of the browser locale). */
export function formatDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
