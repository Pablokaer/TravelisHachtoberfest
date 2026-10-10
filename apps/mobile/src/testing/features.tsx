// Test helper for feature flags (D-065): renders a screen with some hidden features turned on.
import type { ReactNode } from 'react';

import { FEATURES, FeaturesContext, type FeatureFlags } from '@/lib/features';

/**
 * A `render` wrapper with these flags on top of the build's (all off in tests).
 * @example render(<MeetupBanner trip={trip} canJoin />, { wrapper: featuresWrapper({ walkChat: true }) })
 */
export function featuresWrapper(flags: Partial<FeatureFlags>) {
  const value: FeatureFlags = { ...FEATURES, ...flags };
  return function FeaturesWrapper({ children }: { children: ReactNode }) {
    return <FeaturesContext.Provider value={value}>{children}</FeaturesContext.Provider>;
  };
}
