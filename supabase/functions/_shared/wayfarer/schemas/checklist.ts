import { z } from 'zod';

import { VISA_REQUIREMENTS } from '../constants/index.ts';
import { countryCodeSchema, isoDateSchema, languageSchema } from './common.ts';

export const checklistRequestSchema = z.object({
  city: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  nationalities: z.array(countryCodeSchema).min(1).max(5),
  homeCountry: countryCodeSchema.nullable().optional(),
  arrival: isoDateSchema.nullable().optional(),
  departure: isoDateSchema.nullable().optional(),
  passportExpiry: isoDateSchema.nullable().optional(),
  language: languageSchema.default('en'),
});
export type ChecklistRequest = z.infer<typeof checklistRequestSchema>;

const unavailable = z.object({ status: z.literal('unavailable'), reason: z.string() });
const section = <T extends z.ZodRawShape>(shape: T) =>
  z.discriminatedUnion('status', [z.object({ status: z.literal('ok'), ...shape }), unavailable]);

const visaRequirement = z.enum(VISA_REQUIREMENTS);

export const visaSectionSchema = section({
  best: z.object({
    nationality: z.string(),
    requirement: visaRequirement,
    maxStayDays: z.number().int().nullable(),
    isCitizen: z.boolean(),
  }),
  options: z.array(
    z.object({
      nationality: z.string(),
      requirement: visaRequirement,
      maxStayDays: z.number().int().nullable(),
    }),
  ),
  sourceUrl: z.url(),
});

export const passportSectionSchema = section({
  rule: z.enum([
    'free_movement',
    'schengen_3m_after_departure',
    'whole_stay',
    'tr_150d_after_arrival',
    'generic_6m_after_arrival',
  ]),
  requiredUntil: isoDateSchema,
  validity: z.enum(['ok', 'warning', 'problem', 'unknown']),
  passportExpiry: isoDateSchema.nullable(),
});

export const powerSectionSchema = section({
  destinationPlugs: z.array(z.string()),
  destinationVoltage: z.number().nullable(),
  destinationFrequencyHz: z.number().nullable(),
  homePlugs: z.array(z.string()),
  homeVoltage: z.number().nullable(),
  adapterNeeded: z.boolean().nullable(),
  voltageDiffers: z.boolean().nullable(),
});

export const weatherDaySchema = z.object({
  date: isoDateSchema,
  tempMinC: z.number().nullable(),
  tempMaxC: z.number().nullable(),
  precipitationMm: z.number().nullable(),
  precipitationProbability: z.number().nullable(),
  weatherCode: z.number().int().nullable(),
});

export const weatherSectionSchema = section({
  mode: z.enum(['forecast', 'climate']),
  days: z.array(weatherDaySchema),
  /** Climate mode: averages for the travel month over recent years. */
  climate: z
    .object({
      month: z.number().int().min(1).max(12),
      years: z.number().int(),
      avgMinC: z.number(),
      avgMaxC: z.number(),
      avgPrecipitationMm: z.number(),
      avgRainyDays: z.number(),
    })
    .nullable(),
  attribution: z.string(),
});

export const moneySectionSchema = section({
  currency: z.string(),
  homeCurrency: z.string().nullable(),
  /** 1 unit of homeCurrency = rate × currency. */
  rate: z.number().nullable(),
  rateDate: z.string().nullable(),
  provider: z.string().nullable(),
});

export const safetySectionSchema = section({
  /** Global Affairs Canada scale: 0 normal precautions … 3 avoid all travel. */
  level: z.number().int().min(0).max(3),
  hasRegionalAdvisory: z.boolean(),
  summary: z.string(),
  publishedAt: z.string().nullable(),
  sourceName: z.string(),
  sourceUrl: z.url(),
  ukAdviceUrl: z.url(),
});

export const practicalSectionSchema = section({
  drivingSide: z.enum(['left', 'right']).nullable(),
  callingCode: z.string().nullable(),
  emergency: z.object({
    general: z.string().nullable(),
    police: z.string().nullable(),
    ambulance: z.string().nullable(),
    fire: z.string().nullable(),
  }),
  languages: z.array(z.string()),
  timezone: z.string().nullable(),
});

export const checklistResponseSchema = z.object({
  destination: z.object({
    code: countryCodeSchema,
    nameEn: z.string(),
    namePt: z.string(),
    city: z.string(),
  }),
  generatedAt: z.string(),
  visa: visaSectionSchema,
  passport: passportSectionSchema,
  power: powerSectionSchema,
  weather: weatherSectionSchema,
  money: moneySectionSchema,
  safety: safetySectionSchema,
  practical: practicalSectionSchema,
});
export type ChecklistResponse = z.infer<typeof checklistResponseSchema>;
export type WeatherDay = z.infer<typeof weatherDaySchema>;
