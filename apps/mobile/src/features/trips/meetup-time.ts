// When a meetup happens (D-041), in the city's own time: "Sat 3 Oct, 15:05", the countdown, and
// the day groups of the meetups page.
import { countdown, dateFormatCache, localDateTime, type Countdown } from '@wayfarer/shared';
import type { TFunction } from 'i18next';

import type { WalklistCard } from '@/features/trips/community-api';

/** Meetups when the city has no time zone on record. */
export const FALLBACK_TIME_ZONE = 'UTC';

const DAY_MS = 86_400_000;

/** "Sat 3 Oct, 15:05": one formatter per (locale, time zone), not one per row and render. */
const meetupStartFormat = dateFormatCache({
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/** "Saturday 3 October", a day heading of the meetups page. */
const meetupDayFormat = dateFormatCache({ weekday: 'long', day: 'numeric', month: 'long' });

/**
 * The start in the city time and what is left until it.
 * @example meetupWhen(iso, 'Europe/Lisbon', new Date(), 'en-GB').local // 'Sat 3 Oct, 15:05'
 */
export function meetupWhen(
  startsAt: string,
  timeZone: string,
  now: Date,
  locale: string,
): { local: string; countdown: Countdown | null } {
  const local = meetupStartFormat(locale, timeZone).format(new Date(startsAt));
  return { local, countdown: countdown(startsAt, now) };
}

/**
 * "Starts in 2 d 3 h" / "Starts in 1 h 20 min" / "Starts in 45 min" / "Started".
 * @example countdownLabel({ days: 0, hours: 0, minutes: 45 }, t) // 'Starts in 45 min'
 */
export function countdownLabel(left: Countdown | null, t: TFunction): string {
  if (!left) return t('meetups.started');
  const time = left.days
    ? t('meetups.days', left)
    : left.hours
      ? t('meetups.hours', left)
      : t('meetups.minutes', left);
  return t('meetups.startsIn', { time });
}

/**
 * A `YYYY-MM-DD` day of the city, written out for a heading.
 * @example meetupDayLabel('2026-10-03', 'en-GB', 'Europe/Lisbon') // 'Saturday 3 October'
 */
export function meetupDayLabel(day: string, locale: string, timeZone: string): string {
  return meetupDayFormat(locale, timeZone).format(new Date(`${day}T12:00:00Z`));
}

export type MeetupDay = { day: 'today' | 'tomorrow' | string; items: WalklistCard[] };

/**
 * Meetups (already soonest first) grouped by their day in the city: today, tomorrow, then
 * `YYYY-MM-DD`.
 * @example groupByLocalDay(meetups, 'Europe/Lisbon', new Date())[0].day // 'today'
 */
export function groupByLocalDay(
  items: readonly WalklistCard[],
  timeZone: string,
  now: Date,
): MeetupDay[] {
  const today = localDateTime(now.toISOString(), timeZone).date;
  const tomorrow = localDateTime(new Date(now.getTime() + DAY_MS).toISOString(), timeZone).date;
  const groups: MeetupDay[] = [];
  for (const item of items) {
    if (!item.startsAt) continue;
    const date = localDateTime(item.startsAt, timeZone).date;
    const day = date === today ? 'today' : date === tomorrow ? 'tomorrow' : date;
    const last = groups.at(-1);
    if (last?.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }
  return groups;
}
