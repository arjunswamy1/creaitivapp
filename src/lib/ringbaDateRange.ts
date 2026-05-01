import { format } from "date-fns";

/**
 * Ringba reports in fixed Eastern Time (UTC-5, no DST observed in the
 * Billy.com Ringba account per their CPM Report timezone setting).
 *
 * To match Ringba's day boundaries when querying our DB (which stores
 * `call_date` in UTC), we need to offset the local YYYY-MM-DD start/end
 * by +5 hours.
 *
 * Example: "Apr 30 2026" in Ringba ET = `2026-04-30T05:00:00Z` to
 * `2026-05-01T04:59:59.999Z` in UTC.
 */
const RINGBA_OFFSET_HOURS = 5;

/** Returns the UTC ISO string representing the START of the given local
 *  date in Ringba's Eastern Time (fixed UTC-5). */
export function ringbaDayStartUTC(date: Date): string {
  const dateStr = format(date, "yyyy-MM-dd");
  // YYYY-MM-DD 00:00 ET = YYYY-MM-DD 05:00 UTC
  return `${dateStr}T0${RINGBA_OFFSET_HOURS}:00:00.000Z`;
}

/** Returns the UTC ISO string representing the END of the given local
 *  date in Ringba's Eastern Time (fixed UTC-5). */
export function ringbaDayEndUTC(date: Date): string {
  // End of "YYYY-MM-DD" ET = next day 04:59:59.999 UTC
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  const nextStr = format(next, "yyyy-MM-dd");
  return `${nextStr}T0${RINGBA_OFFSET_HOURS - 1}:59:59.999Z`;
}
