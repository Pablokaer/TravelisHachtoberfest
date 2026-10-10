import { describe, expect, it } from 'vitest';

import { REVIEW_COMMENT_MAX } from '../constants/index.ts';
import { reviewFormSchema } from './review.ts';

describe('reviewFormSchema', () => {
  it('accepts a whole rating from 1 to 5 with or without a comment', () => {
    expect(reviewFormSchema.safeParse({ rating: 1, comment: '' }).success).toBe(true);
    expect(reviewFormSchema.safeParse({ rating: 5, comment: 'Lovely' }).success).toBe(true);
  });

  it('rejects ratings outside 1–5 and fractional ratings', () => {
    for (const rating of [0, 6, -1, 4.5]) {
      expect(reviewFormSchema.safeParse({ rating, comment: '' }).success).toBe(false);
    }
  });

  it('requires a rating, with a message the form can translate', () => {
    const result = reviewFormSchema.safeParse({ rating: 0, comment: 'No stars' });
    expect(result.error?.issues[0]?.message).toBe('validation.ratingRequired');
  });

  it('trims the comment and caps its length', () => {
    expect(reviewFormSchema.parse({ rating: 3, comment: '  ok  ' }).comment).toBe('ok');
    const long = 'x'.repeat(REVIEW_COMMENT_MAX + 1);
    expect(reviewFormSchema.safeParse({ rating: 3, comment: long }).success).toBe(false);
  });
});
