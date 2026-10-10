// Calendar maths for the date drop-down of the trip planner (D-081). Dates are ISO strings
// ("YYYY-MM-DD") everywhere, so no time zone can move a day.

export type YearMonth = { year: number; month: number };
export type CalendarDate = YearMonth & { day: number };

const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * @example isoDate(2026, 12, 5) // '2026-12-05'
 */
export function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

const daysIn = (year: number, month: number): number =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

/**
 * @example parseIsoDate('2026-12-05') // { year: 2026, month: 12, day: 5 }
 */
export function parseIsoDate(value: string): CalendarDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const [year, month, day] = match
    ? [Number(match[1]), Number(match[2]), Number(match[3])]
    : [0, 0, 0];
  if (!match || month < 1 || month > 12 || day < 1 || day > daysIn(year, month)) {
    throw new Error(`Invalid date "${value}": expected a real day as YYYY-MM-DD`);
  }
  return { year, month, day };
}

/**
 * @example addMonths({ year: 2026, month: 12 }, 1) // { year: 2027, month: 1 }
 */
export function addMonths({ year, month }: YearMonth, delta: number): YearMonth {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/**
 * The weeks of a month, Monday first, each day an ISO date and the empty cells `null`.
 * @example monthGrid(2026, 12)[0] // [null, '2026-12-01', …]
 */
export function monthGrid(year: number, month: number): (string | null)[][] {
  const leading = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const days = Array.from({ length: daysIn(year, month) }, (_, i) => isoDate(year, month, i + 1));
  const cells: (string | null)[] = [...Array<null>(leading).fill(null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}
