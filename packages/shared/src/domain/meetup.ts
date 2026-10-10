// Walk meetups (D-041): a walk list's start is a moment (UTC), chosen and shown as a wall-clock
// date and time in the city's time zone, so a meetup in Lisbon reads 10:00 wherever you are.

import { dateFormatCache } from './date-format-cache.ts';

export type LocalDateTime = { date: string; time: string };
export type Countdown = { days: number; hours: number; minutes: number };

const MINUTE_MS = 60_000;

/** Every field of a wall-clock moment, read back by zoneOffsetMs (one formatter per zone). */
const wallClockParts = dateFormatCache({
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Offset of `timeZone` from UTC at `instant`, in ms (positive east of Greenwich). */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = wallClockParts('en-US', timeZone).formatToParts(instant);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second'),
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The moment a city's wall-clock date and time happen. On the night the clocks go back the time
 * happens twice: the first one is taken. A time skipped when the clocks go forward is read with
 * the offset from before the change (02:30 → 03:30).
 * @example zonedToUtc('2026-10-04', '10:00', 'Europe/Lisbon').toISOString() // '2026-10-04T09:00:00.000Z'
 */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  // A zone changes offset at most once in a day: the offsets 12 h either side cover both.
  const offsets = [wall - 12 * 3_600_000, wall + 12 * 3_600_000].map((t) =>
    zoneOffsetMs(new Date(t), timeZone),
  );
  const matching = offsets
    .map((offset) => wall - offset)
    .filter((t) => wall - t === zoneOffsetMs(new Date(t), timeZone));
  return new Date(matching.length ? Math.min(...matching) : wall - offsets[0]!);
}

/**
 * The city date and time of a moment.
 * @example localDateTime('2026-10-10T23:30:00Z', 'Europe/Lisbon') // { date: '2026-10-11', time: '00:30' }
 */
export function localDateTime(iso: string, timeZone: string): LocalDateTime {
  const instant = new Date(iso);
  const local = new Date(instant.getTime() + zoneOffsetMs(instant, timeZone));
  const text = local.toISOString();
  return { date: text.slice(0, 10), time: text.slice(11, 16) };
}

/**
 * Time left until `startsAt`, rounded down to the minute; null once it has started.
 * @example countdown('2026-10-03T13:05:00Z', new Date('2026-10-01T10:00:00Z')) // { days: 2, hours: 3, minutes: 5 }
 */
export function countdown(startsAt: string, now: Date): Countdown | null {
  const left = Math.floor((Date.parse(startsAt) - now.getTime()) / MINUTE_MS);
  if (left <= 0) return null;
  return {
    days: Math.floor(left / 1440),
    hours: Math.floor((left % 1440) / 60),
    minutes: left % 60,
  };
}

/**
 * The start to save from the form's date and time (city time), or why it cannot be saved.
 * No time means no meetup.
 * @example meetupStart({ tripDate: '2026-10-04', startTime: '10:00' }, 'Europe/Lisbon', new Date())
 */
export function meetupStart(
  form: { tripDate: string | null; startTime: string | null },
  timeZone: string,
  now: Date,
): { startsAt: string | null } | { error: 'validation.startInPast' } {
  if (!form.tripDate || !form.startTime) return { startsAt: null };
  const start = zonedToUtc(form.tripDate, form.startTime, timeZone);
  if (start.getTime() <= now.getTime()) return { error: 'validation.startInPast' };
  return { startsAt: start.toISOString() };
}
