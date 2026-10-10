import { ROUTE_MAX_STOPS } from '@wayfarer/shared';
import type { TFunction } from 'i18next';

import type { ToggleOutcome } from './store';

/**
 * User-facing notice for a route toggle, or null when the change speaks for itself.
 * @example routeNotice('full', t) // 'Your route already has 20 stops.'
 */
export function routeNotice(outcome: ToggleOutcome, t: TFunction): string | null {
  if (outcome === 'full') return t('route.full', { max: ROUTE_MAX_STOPS });
  if (outcome === 'startedNewCity') return t('route.startedNewCity');
  return null;
}
