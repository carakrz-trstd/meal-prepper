/** Parses ISO 8601 durations (PT1H30M, P0DT45M) to whole minutes; null if it cannot be parsed. */
export function parseDurationMinutes(value: string | undefined | null): number | null {
  if (!value) return null;
  const m = value.trim().match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
  if (!m || (!m[1] && !m[2] && !m[3] && !m[4] && !/T|D/i.test(value))) return null;
  const [, d, h, min, s] = m;
  const total = Number(d ?? 0) * 1440 + Number(h ?? 0) * 60 + Number(min ?? 0) + Math.round(Number(s ?? 0) / 60);
  return Number.isFinite(total) ? total : null;
}
