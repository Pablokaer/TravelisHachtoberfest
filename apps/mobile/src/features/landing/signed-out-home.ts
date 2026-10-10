/** The (auth) screen a signed-out visitor lands on. */
export type SignedOutHome = 'welcome' | 'sign-in';

/**
 * Where signed-out users start (D-072): the landing page on the web, where people arrive from a
 * link or a search; sign-in in the native apps, whose users already chose to install Travelist.
 * @example signedOutHome(Platform.OS) // 'welcome' on the web
 */
export function signedOutHome(platform: string): SignedOutHome {
  return platform === 'web' ? 'welcome' : 'sign-in';
}
