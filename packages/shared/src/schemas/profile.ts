import { z } from 'zod';

import { MAX_NATIONALITIES } from '../constants/index.ts';
import { countryCodeSchema, isoDateSchema, languageSchema, unitsSchema } from './common.ts';

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, { message: 'validation.required' })
  .max(80, { message: 'validation.tooLong' });

/**
 * Unique sign-in handle shown in the walk chat (D-048); the DB check mirrors the pattern.
 * @example nicknameSchema.parse('  Nina_Walks ') // 'nina_walks'
 */
export const NICKNAME_PATTERN = /^[a-z0-9_]{3,20}$/;
export const nicknameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(NICKNAME_PATTERN, { message: 'validation.nickname' });

export const emailSchema = z.email({ message: 'validation.email' });
export const passwordSchema = z.string().min(8, { message: 'validation.passwordLength' });

/** Email or nickname: nicknames never contain "@" (see `nicknameSchema`). */
export const signInSchema = z.object({
  login: z.string().trim().min(1, { message: 'validation.required' }),
  password: z.string().min(1, { message: 'validation.required' }),
});
export const signUpSchema = z.object({
  displayName: displayNameSchema,
  nickname: nicknameSchema,
  email: emailSchema,
  password: passwordSchema,
});
export const magicLinkSchema = z.object({ email: emailSchema });
/** "Forgot password?": the address the reset link goes to (D-066). */
export const passwordResetRequestSchema = z.object({ email: emailSchema });
/** The new password after a reset link, typed twice; same length rule as sign-up. */
export const newPasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((form) => form.password === form.confirm, {
    message: 'validation.passwordMismatch',
    path: ['confirm'],
  });
export const otpSchema = z.object({
  code: z.string().regex(/^\d{6}$/, { message: 'validation.otp' }),
});

export const nationalitiesSchema = z
  .array(countryCodeSchema)
  .min(1, { message: 'validation.nationalityRequired' })
  .max(MAX_NATIONALITIES, { message: 'validation.tooManyNationalities' })
  .refine((a) => new Set(a).size === a.length, { message: 'validation.duplicate' });

/** Profile as edited in onboarding / profile screen. */
export const profileFormSchema = z.object({
  displayName: displayNameSchema,
  nickname: nicknameSchema,
  language: languageSchema,
  units: unitsSchema,
  homeCountry: countryCodeSchema,
  nationalities: nationalitiesSchema,
  passportExpiry: isoDateSchema.nullable(),
});
export type ProfileForm = z.infer<typeof profileFormSchema>;

/** Onboarding steps validate subsets of the profile. */
export const onboardingStepSchemas = [
  profileFormSchema.pick({ displayName: true, nickname: true, language: true, units: true }),
  profileFormSchema.pick({ homeCountry: true, nationalities: true }),
  profileFormSchema.pick({ passportExpiry: true }),
] as const;
