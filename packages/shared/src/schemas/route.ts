import { z } from 'zod';

import { ROUTE_MAX_STOPS, ROUTE_MIN_STOPS } from '../constants/index.ts';
import { isoDateSchema } from './common.ts';

export const routeStopSchema = z.object({
  id: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  visitMinutes: z.number().int().min(0).max(600),
});
export type RouteStop = z.infer<typeof routeStopSchema>;

export const routeRequestSchema = z.object({
  stops: z
    .array(routeStopSchema)
    .min(ROUTE_MIN_STOPS)
    .max(ROUTE_MAX_STOPS)
    .refine((s) => new Set(s.map((x) => x.id)).size === s.length, { message: 'duplicate stop' }),
  /** Keep the first stop as the starting point (default) instead of letting the optimiser pick. */
  keepFirst: z.boolean().default(true),
  /**
   * Walk the stops in the given order (an order set by hand, D-046): only the street path and
   * the legs are computed, nothing is reordered.
   */
  keepOrder: z.boolean().default(false),
});
export type RouteRequest = z.infer<typeof routeRequestSchema>;

export const lineStringSchema = z.object({
  type: z.literal('LineString'),
  coordinates: z.array(z.tuple([z.number(), z.number()])).min(2),
});
export type LineString = z.infer<typeof lineStringSchema>;

export const routeResponseSchema = z.object({
  order: z.array(z.string()),
  legs: z.array(
    z.object({
      fromId: z.string(),
      toId: z.string(),
      distanceM: z.number(),
      durationS: z.number(),
    }),
  ),
  geometry: lineStringSchema,
  distanceM: z.number(),
  walkingSeconds: z.number(),
  visitMinutes: z.number(),
  isFallback: z.boolean(),
  provider: z.enum(['openrouteservice', 'fallback']),
  attribution: z.string(),
});
export type RouteResponse = z.infer<typeof routeResponseSchema>;

/** A wall-clock time, 24 h: "09:30". */
export const clockTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'validation.time' });

export const saveTripFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, { message: 'validation.required' })
      .max(80, { message: 'validation.tooLong' }),
    tripDate: isoDateSchema.nullable(),
    /** Optional start time in the city (D-041); with the date it makes the list a meetup. */
    startTime: clockTimeSchema.nullable(),
  })
  .refine((f) => !f.startTime || f.tripDate, {
    path: ['tripDate'],
    message: 'validation.timeNeedsDate',
  });
export type SaveTripForm = z.infer<typeof saveTripFormSchema>;
