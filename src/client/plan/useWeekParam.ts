import { useSearchParams } from 'react-router-dom';
import { compareWeeks, isValidWeekStart, localDateString, mondayOf } from '../../shared/week';

/** The week shown by a page: `?week=` if it is a valid Monday that is not in the past, else the current week (AC-11). */
export function useWeekParam(): { week: string; current: string; setWeek: (week: string) => void } {
  const [params, setParams] = useSearchParams();
  const current = mondayOf(localDateString(new Date()));
  const raw = params.get('week');
  const week = raw && isValidWeekStart(raw) && compareWeeks(raw, current) >= 0 ? raw : current;
  return { week, current, setWeek: (w) => setParams({ week: w }) };
}
