import { z } from 'zod';

import { SUPPORTED_LANGUAGES, THEMES, UNITS } from '../constants/index.ts';

/** ISO-3166-1 alpha-2, uppercase (e.g. "PT"). */
export const countryCodeSchema = z
  .string()
  .regex(/^[A-Z]{2}$/, { message: 'validation.countryCode' });

export const languageSchema = z.enum(SUPPORTED_LANGUAGES);
export const unitsSchema = z.enum(UNITS);
export const themeSchema = z.enum(THEMES);

/** Calendar date in ISO format (YYYY-MM-DD). */
export const isoDateSchema = z.iso.date({ message: 'validation.date' });

export const latLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type LatLng = z.infer<typeof latLngSchema>;
