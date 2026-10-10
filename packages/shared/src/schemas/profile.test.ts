import { describe, expect, it } from 'vitest';

import {
  newPasswordSchema,
  nicknameSchema,
  passwordResetRequestSchema,
  profileFormSchema,
  signInSchema,
  signUpSchema,
} from './profile.ts';

describe('nickname (D-048)', () => {
  it('is stored trimmed and lowercase', () => {
    expect(nicknameSchema.parse('  Nina_Walks ')).toBe('nina_walks');
  });

  it('takes 3 to 20 letters, digits or underscores, nothing else', () => {
    expect(nicknameSchema.safeParse('abc').success).toBe(true);
    expect(nicknameSchema.safeParse('a'.repeat(20)).success).toBe(true);
    for (const bad of ['ab', 'a'.repeat(21), 'nina walks', 'nina@walks', 'niña', 'nina-walks']) {
      expect(nicknameSchema.safeParse(bad).error?.issues[0]?.message, bad).toBe(
        'validation.nickname',
      );
    }
  });

  it('is required at sign-up and in the profile', () => {
    const signUp = {
      displayName: 'Nina',
      nickname: 'nina_walks',
      email: 'n@x.io',
      password: '12345678',
    };
    expect(signUpSchema.safeParse(signUp).success).toBe(true);
    expect(signUpSchema.safeParse({ ...signUp, nickname: '' }).success).toBe(false);
    expect(profileFormSchema.shape.nickname).toBe(nicknameSchema);
  });
});

describe('sign-in', () => {
  it('takes an email or a nickname, trimmed', () => {
    expect(signInSchema.parse({ login: ' nina_walks ', password: 'x' }).login).toBe('nina_walks');
    expect(signInSchema.parse({ login: 'n@x.io', password: 'x' }).login).toBe('n@x.io');
    expect(signInSchema.safeParse({ login: '  ', password: 'x' }).success).toBe(false);
  });
});

describe('password recovery (D-066)', () => {
  it('asks for a valid email to send the reset link to', () => {
    expect(passwordResetRequestSchema.safeParse({ email: 'nina@example.com' }).success).toBe(true);
    expect(passwordResetRequestSchema.safeParse({ email: 'nina' }).error?.issues[0]?.message).toBe(
      'validation.email',
    );
  });

  it('takes a new password of at least 8 characters, typed twice', () => {
    expect(
      newPasswordSchema.safeParse({ password: 'long-enough', confirm: 'long-enough' }).success,
    ).toBe(true);
    expect(
      newPasswordSchema.safeParse({ password: 'short', confirm: 'short' }).error?.issues[0]
        ?.message,
    ).toBe('validation.passwordLength');
  });

  it('rejects a confirmation that differs, on the confirmation field', () => {
    const issue = newPasswordSchema.safeParse({ password: 'long-enough', confirm: 'long-enougH' })
      .error?.issues[0];
    expect(issue?.message).toBe('validation.passwordMismatch');
    expect(issue?.path).toEqual(['confirm']);
  });
});
