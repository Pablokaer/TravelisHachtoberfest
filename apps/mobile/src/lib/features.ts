// Feature flags (D-065): switches for features that are built but hidden for now — the walk
// group chat (D-043) and the paid plans UI (D-047). The code, routes and backend stay; only the
// entry points are gated, so turning a feature back on is setting its variable at build time:
//   EXPO_PUBLIC_FEATURE_WALK_CHAT=true   EXPO_PUBLIC_FEATURE_PAID_PLANS=true
// Off unless set: a build that forgets the variable ships with the feature hidden, never shown
// by accident. Read with static `process.env.EXPO_PUBLIC_X` access so Metro inlines them.
import { createContext, useContext } from 'react';

export type FeatureFlags = {
  /** The group chat of a walk list: "Open group chat", its hint and `/walk-chat`. */
  walkChat: boolean;
  /** Paid plans: "Upgrade" in the top bar, `/plans` and Settings → Subscription. */
  paidPlans: boolean;
  /** Local mode (D-078): the app opens without sign-in, for a self-hosted install. */
  localMode: boolean;
};

const VARIABLES: Record<keyof FeatureFlags, string> = {
  walkChat: 'EXPO_PUBLIC_FEATURE_WALK_CHAT',
  paidPlans: 'EXPO_PUBLIC_FEATURE_PAID_PLANS',
  localMode: 'EXPO_PUBLIC_LOCAL_MODE',
};

/** One flag: "true"/"1" on, "false"/"0"/empty/unset off, anything else a configuration error. */
function parseFlag(name: keyof FeatureFlags, value: string | undefined): boolean {
  const normalized = (value ?? '').trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === '' || normalized === 'false' || normalized === '0') return false;
  throw new Error(
    `Invalid ${VARIABLES[name]}: got "${value}", expected "true", "false", "1", "0" or unset`,
  );
}

/**
 * The flags from their raw variable values.
 * @example parseFeatureFlags({ walkChat: 'true', paidPlans: undefined, localMode: undefined }) // { walkChat: true, paidPlans: false, localMode: false }
 */
export function parseFeatureFlags(
  raw: Record<keyof FeatureFlags, string | undefined>,
): FeatureFlags {
  return {
    walkChat: parseFlag('walkChat', raw.walkChat),
    paidPlans: parseFlag('paidPlans', raw.paidPlans),
    localMode: parseFlag('localMode', raw.localMode),
  };
}

/** This build's flags. */
export const FEATURES: FeatureFlags = parseFeatureFlags({
  walkChat: process.env.EXPO_PUBLIC_FEATURE_WALK_CHAT,
  paidPlans: process.env.EXPO_PUBLIC_FEATURE_PAID_PLANS,
  localMode: process.env.EXPO_PUBLIC_LOCAL_MODE,
});

/**
 * The flags as a context, defaulting to this build's: the app needs no provider; tests inject
 * other flags with `<FeaturesContext.Provider>` (see `@/testing/features`).
 */
export const FeaturesContext = createContext<FeatureFlags>(FEATURES);

/**
 * @example const { walkChat } = useFeatures(); if (walkChat) showChatButton();
 */
export function useFeatures(): FeatureFlags {
  return useContext(FeaturesContext);
}
