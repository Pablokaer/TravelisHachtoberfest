import { z } from 'zod';

import { REVIEW_COMMENT_MAX, REVIEW_RATING_MAX, REVIEW_RATING_MIN } from '../constants/index.ts';

/**
 * An attraction review as written in the form: a whole 1–5 star rating (required) and an
 * optional comment (D-028). The DB checks the same limits; an empty comment is saved as none.
 * @example reviewFormSchema.parse({ rating: 5, comment: ' Lovely ' }) // { rating: 5, comment: 'Lovely' }
 */
export const reviewFormSchema = z.object({
  rating: z
    .number()
    .int({ message: 'validation.ratingRequired' })
    .min(REVIEW_RATING_MIN, { message: 'validation.ratingRequired' })
    .max(REVIEW_RATING_MAX, { message: 'validation.ratingRequired' }),
  comment: z.string().trim().max(REVIEW_COMMENT_MAX, { message: 'validation.tooLong' }),
});
export type ReviewForm = z.infer<typeof reviewFormSchema>;
