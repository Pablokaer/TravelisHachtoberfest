import { describe, expect, it } from 'vitest';

import { MEETUP_PREVIEW_COUNT } from '../constants/index.ts';
import { saveTripFormSchema } from '../schemas/route.ts';
import { sharedTripResultSchema } from '../schemas/trip.ts';
import { countdown, localDateTime, meetupStart, zonedToUtc } from './meetup.ts';

describe('zonedToUtc (D-041)', () => {
  it('reads a wall-clock time in the city time zone', () => {
    // Lisbon is UTC+1 in summer time, UTC+0 in winter.
    expect(zonedToUtc('2026-10-04', '10:00', 'Europe/Lisbon').toISOString()).toBe(
      '2026-10-04T09:00:00.000Z',
    );
    expect(zonedToUtc('2026-12-04', '10:00', 'Europe/Lisbon').toISOString()).toBe(
      '2026-12-04T10:00:00.000Z',
    );
    expect(zonedToUtc('2026-10-04', '10:00', 'Europe/Istanbul').toISOString()).toBe(
      '2026-10-04T07:00:00.000Z',
    );
  });

  it('reads a time skipped when the clocks go forward with the earlier offset', () => {
    // Lisbon, 29 March 2026: 01:00 jumps to 02:00, so 01:30 is read as 02:30 summer time.
    expect(zonedToUtc('2026-03-29', '01:30', 'Europe/Lisbon').toISOString()).toBe(
      '2026-03-29T01:30:00.000Z',
    );
  });

  it('handles the night the clocks go back (the first 01:30 in Lisbon)', () => {
    expect(zonedToUtc('2026-10-25', '01:30', 'Europe/Lisbon').toISOString()).toBe(
      '2026-10-25T00:30:00.000Z',
    );
  });
});

describe('localDateTime', () => {
  it('shows a moment as the city date and time', () => {
    expect(localDateTime('2026-10-10T23:30:00Z', 'Europe/Lisbon')).toEqual({
      date: '2026-10-11',
      time: '00:30',
    });
  });
});

describe('countdown', () => {
  const now = new Date('2026-10-01T10:00:00Z');

  it('splits the time left into days, hours and minutes', () => {
    expect(countdown('2026-10-03T13:05:30Z', now)).toEqual({ days: 2, hours: 3, minutes: 5 });
    expect(countdown('2026-10-01T10:45:00Z', now)).toEqual({ days: 0, hours: 0, minutes: 45 });
  });

  it('is null once the meetup has started', () => {
    expect(countdown('2026-10-01T10:00:00Z', now)).toBeNull();
    expect(countdown('2026-10-01T09:00:00Z', now)).toBeNull();
  });
});

describe('meetupStart', () => {
  const now = new Date('2026-10-01T10:00:00Z');

  it('no time means no meetup', () => {
    expect(meetupStart({ tripDate: '2026-10-04', startTime: null }, 'Europe/Lisbon', now)).toEqual({
      startsAt: null,
    });
  });

  it('a date and a time give the start, in the city time zone', () => {
    expect(
      meetupStart({ tripDate: '2026-10-04', startTime: '10:00' }, 'Europe/Lisbon', now),
    ).toEqual({
      startsAt: '2026-10-04T09:00:00.000Z',
    });
  });

  it('a start in the past is refused', () => {
    expect(
      meetupStart({ tripDate: '2026-10-01', startTime: '10:30' }, 'Europe/Lisbon', now),
    ).toEqual({
      error: 'validation.startInPast',
    });
  });
});

describe('save trip form with a start time', () => {
  it('accepts an optional HH:MM time with a date', () => {
    const ok = saveTripFormSchema.safeParse({
      name: 'Walk',
      tripDate: '2026-10-04',
      startTime: '09:30',
    });
    expect(ok.success).toBe(true);
    const none = saveTripFormSchema.safeParse({ name: 'Walk', tripDate: null, startTime: null });
    expect(none.success).toBe(true);
  });

  it('rejects a bad time, and a time without a date', () => {
    const bad = saveTripFormSchema.safeParse({
      name: 'Walk',
      tripDate: '2026-10-04',
      startTime: '25:00',
    });
    expect(bad.error?.issues[0]).toMatchObject({ path: ['startTime'], message: 'validation.time' });
    const alone = saveTripFormSchema.safeParse({
      name: 'Walk',
      tripDate: null,
      startTime: '09:30',
    });
    expect(alone.error?.issues[0]).toMatchObject({
      path: ['tripDate'],
      message: 'validation.timeNeedsDate',
    });
  });
});

describe('meetups on shared lists and previews', () => {
  it('a shared list carries its start, the number going and whether the caller is', () => {
    const trip = {
      id: 't1',
      name: 'Walk',
      city_slug: 'lisbon',
      trip_date: null,
      route_geometry: null,
      distance_m: null,
      walking_seconds: null,
      visit_minutes: null,
      is_fallback: false,
      provider: null,
      visibility: 'public',
      created_at: '2026-09-29T10:00:00+00:00',
      is_owner: false,
      is_official: false,
      author_name: null,
      review_count: 0,
      rating_avg: null,
      is_saved: false,
      stop_ids: [],
      starts_at: '2026-10-04T09:00:00+00:00',
      attendee_count: 3,
      is_attending: true,
    };
    const result = sharedTripResultSchema.parse({ status: 'ok', trip });
    expect(result.status === 'ok' && result.trip).toMatchObject({
      attendee_count: 3,
      is_attending: true,
    });
    expect(MEETUP_PREVIEW_COUNT).toBe(5);
  });
});
