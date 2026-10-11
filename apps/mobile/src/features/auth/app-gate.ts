// Who gets past the start of the app (D-078 local mode, onboarding) and what happens with no
// connection (D-092): a signed-in traveller whose profile cannot be loaded is not sent to
// onboarding, because that screen would ask for what they already gave.

export type AppGate = {
  /** Local mode (D-078): the app opens without a sign-in screen. */
  localMode: boolean;
  signedIn: boolean;
  /** The profile says the traveller finished onboarding. */
  onboarded: boolean;
  /** The profile could not be loaded (no connection): its answer is unknown, not "no". */
  profileFailed: boolean;
};

/**
 * @example canEnterApp({ localMode: false, signedIn: true, onboarded: false, profileFailed: true }) // true
 */
export function canEnterApp({ localMode, signedIn, onboarded, profileFailed }: AppGate): boolean {
  return localMode || (signedIn && (onboarded || profileFailed));
}
