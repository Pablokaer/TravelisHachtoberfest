import * as AppleAuthentication from 'expo-apple-authentication';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { removeAllProfilePhotos } from '@/features/profile/avatar-api';
import { supabase } from '@/lib/supabase';

export type OAuthProvider = 'google' | 'apple';

/** Where Supabase sends users back after magic links and OAuth. */
export function authRedirectUrl() {
  return Linking.createURL('/auth/callback');
}

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function signInWithPassword(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  fail(error);
}

/** Supabase Auth's answer to a wrong email or password; a wrong nickname gets the same one. */
const INVALID_LOGIN = 'Invalid login credentials';

/** Too many failed sign-ins with this nickname (D-048: 10 in 15 minutes). */
export class NicknameLockedError extends Error {
  constructor(nickname: string) {
    super(
      `too many failed sign-ins for nickname ${nickname}, expected fewer than 10 in 15 minutes`,
    );
    this.name = 'NicknameLockedError';
  }
}

/**
 * Nicknames never contain "@" (D-048), so an "@" means the user typed an email.
 * @example isEmailLogin('nina_walks') // false
 */
export function isEmailLogin(login: string): boolean {
  return login.includes('@');
}

/** The account email for a nickname, given its password; null when either is wrong. */
async function emailForNickname(nickname: string, password: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('login_email_for_nickname', {
    p_nickname: nickname.trim().toLowerCase(),
    p_password: password,
  });
  if (error?.code === 'P0429') throw new NicknameLockedError(nickname);
  fail(error);
  return data;
}

/**
 * Signs in with an email or a nickname (D-048) and the password. The session always comes from
 * Supabase Auth's password sign-in; a nickname is first turned into its account's email.
 * @example await signInWithLogin('nina_walks', password)
 */
export async function signInWithLogin(login: string, password: string) {
  const trimmed = login.trim();
  if (isEmailLogin(trimmed)) return signInWithPassword(trimmed, password);
  const email = await emailForNickname(trimmed, password);
  if (!email) throw new Error(INVALID_LOGIN);
  return signInWithPassword(email, password);
}

/**
 * Whether a nickname is valid and free (checked before sign-up, and when it changes).
 * @example await nicknameAvailable('nina_walks') // false once taken
 */
export async function nicknameAvailable(nickname: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('nickname_available', { p_nickname: nickname });
  fail(error);
  return data === true;
}

/** Returns true when the user must confirm the email before signing in. */
export async function signUp(input: {
  email: string;
  password: string;
  displayName: string;
  nickname: string;
  language: string;
}) {
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: authRedirectUrl(),
      data: { display_name: input.displayName, nickname: input.nickname, language: input.language },
    },
  });
  fail(error);
  return !data.session;
}

export async function sendMagicLink(email: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: authRedirectUrl(), shouldCreateUser: true },
  });
  fail(error);
}

export async function verifyEmailCode(email: string, token: string) {
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  fail(error);
}

/** Completes a PKCE callback URL (magic link, email confirmation, OAuth). */
export async function completeAuthFromUrl(url: string) {
  const { queryParams } = Linking.parse(url);
  const errorDescription = queryParams?.error_description;
  if (typeof errorDescription === 'string') throw new Error(errorDescription);
  const code = queryParams?.code;
  if (typeof code !== 'string') return false;
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  fail(error);
  return true;
}

async function nativeAppleSignIn() {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });
  if (!credential.identityToken) throw new Error('Apple did not return an identity token');
  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  fail(error);
  const name = [credential.fullName?.givenName, credential.fullName?.familyName]
    .filter(Boolean)
    .join(' ');
  // Apple only shares the name on the first sign-in; keep it on the profile.
  if (name) await supabase.auth.updateUser({ data: { full_name: name } });
}

/**
 * OAuth sign-in. iOS uses native Sign in with Apple; everything else goes through the
 * Supabase-hosted OAuth page (web redirect, or an in-app browser session on native).
 */
export async function signInWithOAuth(provider: OAuthProvider) {
  if (
    provider === 'apple' &&
    Platform.OS === 'ios' &&
    (await AppleAuthentication.isAvailableAsync())
  ) {
    return nativeAppleSignIn();
  }
  const redirectTo = authRedirectUrl();
  if (Platform.OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
    fail(error);
    return;
  }
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  fail(error);
  if (!data.url) throw new Error('OAuth provider did not return a URL');
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type === 'success') await completeAuthFromUrl(result.url);
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  fail(error);
}

export async function deleteAccount() {
  // Storage files do not cascade with the account rows: remove the profile photos first (D-039).
  const { data } = await supabase.auth.getSession();
  if (data.session) await removeAllProfilePhotos(data.session.user.id);
  const { error } = await supabase.rpc('delete_account');
  fail(error);
  await supabase.auth.signOut({ scope: 'local' });
}
