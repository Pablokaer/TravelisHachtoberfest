import { z } from 'zod';

import {
  ATTRACTION_CATEGORIES,
  TRIP_PASSWORD_MAX,
  TRIP_PASSWORD_MIN,
  TRIP_VISIBILITIES,
} from '../constants/index.ts';
import { isoDateSchema } from './common.ts';

export const tripVisibilitySchema = z.enum(TRIP_VISIBILITIES);

/**
 * The owner's visibility form (D-031). A new password needs 4–72 characters and is never
 * trimmed; left blank, a trip that is already protected keeps its password.
 * @example tripVisibilityFormSchema(true).parse({ visibility: 'password', password: '' }) // ok
 */
export function tripVisibilityFormSchema(hasPassword: boolean) {
  return z
    .object({
      visibility: tripVisibilitySchema,
      password: z
        .string()
        .max(TRIP_PASSWORD_MAX, { message: 'validation.tripPasswordLength' })
        .refine((p) => p === '' || p.length >= TRIP_PASSWORD_MIN, {
          message: 'validation.tripPasswordLength',
        }),
    })
    .refine((f) => f.visibility !== 'password' || hasPassword || f.password !== '', {
      path: ['password'],
      message: 'validation.tripPasswordRequired',
    });
}
export type TripVisibilityForm = z.infer<ReturnType<typeof tripVisibilityFormSchema>>;

/** A stop's place in a `shared_trip` answer: the `attraction_details` columns a card shows. */
export const tripStopPlaceSchema = z.object({
  id: z.string(),
  city_slug: z.string(),
  name_en: z.string(),
  name_pt: z.string().nullable(),
  category: z.enum(ATTRACTION_CATEGORIES),
  lat: z.number(),
  lng: z.number(),
  popularity: z.number(),
  avg_visit_minutes: z.number(),
  image_url: z.string().nullable(),
  is_unesco: z.boolean(),
});

/**
 * The `trip` of a `shared_trip` answer: the trip's columns, its stop ids in order (and their
 * places, D-057), is_owner, and the author, official badge, rating and saved state (D-035).
 */
export const sharedTripSchema = z.object({
  id: z.string(),
  name: z.string(),
  city_slug: z.string(),
  trip_date: isoDateSchema.nullable(),
  route_geometry: z.unknown().nullable(),
  distance_m: z.number().nullable(),
  walking_seconds: z.number().nullable(),
  visit_minutes: z.number().nullable(),
  is_fallback: z.boolean(),
  provider: z.string().nullable(),
  visibility: tripVisibilitySchema,
  created_at: z.string(),
  is_owner: z.boolean(),
  /** Marked official by a moderator (D-035). */
  is_official: z.boolean(),
  author_name: z.string().nullable(),
  review_count: z.number().int(),
  rating_avg: z.number().nullable(),
  /** The signed-in caller saved it (always false signed out). */
  is_saved: z.boolean(),
  /** Meetup (D-041): start, how many are going, whether the caller is. */
  starts_at: z.string().nullable(),
  attendee_count: z.number().int(),
  is_attending: z.boolean(),
  stop_ids: z.array(z.string()),
  /** The stops' places in order, so the page needs no second request; absent before D-057. */
  stops: z.array(tripStopPlaceSchema).optional(),
});
export type SharedTrip = z.infer<typeof sharedTripSchema>;
export type TripStopPlace = z.infer<typeof tripStopPlaceSchema>;

/**
 * What `shared_trip(id, password)` returns: the trip, or why it cannot be shown. Private and
 * missing trips are both `not_found`, so a link never reveals that a private trip exists.
 * @example sharedTripResultSchema.parse({ status: 'password_required' })
 */
export const sharedTripResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), trip: sharedTripSchema }),
  z.object({ status: z.literal('not_found') }),
  z.object({ status: z.literal('password_required') }),
  z.object({ status: z.literal('wrong_password') }),
]);
export type SharedTripResult = z.infer<typeof sharedTripResultSchema>;
