import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TRIP_VISIBILITY,
  TRIP_PASSWORD_MAX,
  TRIP_PASSWORD_MIN,
  WALKLIST_PAGE_SIZE,
  WALKLIST_PREVIEW_COUNT,
  WALKLIST_SORTS,
} from '../constants/index.ts';
import { sharedTripResultSchema, tripVisibilityFormSchema } from './trip.ts';

describe('trip visibility constants', () => {
  it('starts private and bounds passwords by what bcrypt reads (72 bytes)', () => {
    expect(DEFAULT_TRIP_VISIBILITY).toBe('private');
    expect([TRIP_PASSWORD_MIN, TRIP_PASSWORD_MAX]).toEqual([4, 72]);
  });
});

describe('walk list listing constants (D-035)', () => {
  it('sorts by rating (both ways), number of reviews or date; pages of 20, previews of 6', () => {
    expect(WALKLIST_SORTS).toEqual(['top', 'lowest', 'most_reviewed', 'newest']);
    expect(WALKLIST_PAGE_SIZE).toBe(20);
    expect(WALKLIST_PREVIEW_COUNT).toBe(6);
  });
});

describe('tripVisibilityFormSchema', () => {
  const unprotected = tripVisibilityFormSchema(false);
  const protectedTrip = tripVisibilityFormSchema(true);

  it('accepts private and public without a password', () => {
    expect(unprotected.safeParse({ visibility: 'private', password: '' }).success).toBe(true);
    expect(unprotected.safeParse({ visibility: 'public', password: '' }).success).toBe(true);
  });

  it('rejects an unknown visibility', () => {
    expect(unprotected.safeParse({ visibility: 'friends', password: '' }).success).toBe(false);
  });

  it('requires a password to protect a trip that has none yet', () => {
    const result = unprotected.safeParse({ visibility: 'password', password: '' });
    expect(result.error?.issues[0]).toMatchObject({
      path: ['password'],
      message: 'validation.tripPasswordRequired',
    });
  });

  it('keeps the current password when a protected trip leaves the field blank', () => {
    expect(protectedTrip.safeParse({ visibility: 'password', password: '' }).success).toBe(true);
  });

  it('bounds a new password to 4–72 characters, without trimming it', () => {
    const tooShort = unprotected.safeParse({ visibility: 'password', password: 'abc' });
    expect(tooShort.error?.issues[0]?.message).toBe('validation.tripPasswordLength');
    const tooLong = 'x'.repeat(TRIP_PASSWORD_MAX + 1);
    expect(protectedTrip.safeParse({ visibility: 'password', password: tooLong }).success).toBe(
      false,
    );
    expect(unprotected.parse({ visibility: 'password', password: ' ab ' }).password).toBe(' ab ');
  });
});

describe('sharedTripResultSchema', () => {
  const trip = {
    id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
    name: "Olga's walk",
    city_slug: 'lisbon',
    trip_date: null,
    route_geometry: null,
    distance_m: 1200,
    walking_seconds: 900,
    visit_minutes: 90,
    is_fallback: false,
    provider: 'openrouteservice',
    visibility: 'public',
    created_at: '2026-09-29T10:00:00+00:00',
    is_owner: false,
    is_official: false,
    author_name: 'Olga',
    review_count: 2,
    rating_avg: 4.5,
    is_saved: true,
    starts_at: null,
    attendee_count: 0,
    is_attending: false,
    stop_ids: ['a1', 'a2'],
  };

  it('parses an opened trip', () => {
    const result = sharedTripResultSchema.parse({ status: 'ok', trip });
    expect(result.status === 'ok' && result.trip.stop_ids).toEqual(['a1', 'a2']);
  });

  it('carries the author, the official badge, the rating and whether it is saved (D-035)', () => {
    const result = sharedTripResultSchema.parse({ status: 'ok', trip });
    expect(result.status === 'ok' && result.trip).toMatchObject({
      author_name: 'Olga',
      is_official: false,
      review_count: 2,
      rating_avg: 4.5,
      is_saved: true,
    });
  });

  it('accepts a list without reviews or author name', () => {
    const unrated = { ...trip, author_name: null, review_count: 0, rating_avg: null };
    expect(sharedTripResultSchema.safeParse({ status: 'ok', trip: unrated }).success).toBe(true);
  });

  it('parses the statuses that carry no trip', () => {
    for (const status of ['not_found', 'password_required', 'wrong_password'] as const) {
      expect(sharedTripResultSchema.parse({ status })).toEqual({ status });
    }
  });

  it('rejects an unknown status or an "ok" without a trip', () => {
    expect(sharedTripResultSchema.safeParse({ status: 'maybe' }).success).toBe(false);
    expect(sharedTripResultSchema.safeParse({ status: 'ok' }).success).toBe(false);
  });
});
