import { useEffect, useState } from 'react';

import { type RecoveryLinkParams, startRecoverySession } from './recovery-api';

export type RecoveryLinkState = 'verifying' | 'ready' | 'invalid';

/** Only the string query values the reset link can carry. */
function linkParams(query: Record<string, string | string[] | undefined>): RecoveryLinkParams {
  const pick = (key: keyof RecoveryLinkParams) =>
    typeof query[key] === 'string' ? (query[key] as string) : undefined;
  return {
    token_hash: pick('token_hash'),
    type: pick('type'),
    code: pick('code'),
    error_description: pick('error_description'),
  };
}

/**
 * Signs in with the reset link in the page's query and reports how it went.
 * @example const state = useRecoveryLink(useLocalSearchParams()); // 'verifying' → 'ready'
 */
export function useRecoveryLink(
  query: Record<string, string | string[] | undefined>,
): RecoveryLinkState {
  const [state, setState] = useState<RecoveryLinkState>('verifying');
  const key = JSON.stringify(linkParams(query));
  useEffect(() => {
    let active = true;
    startRecoverySession(JSON.parse(key) as RecoveryLinkParams)
      .then(() => active && setState('ready'))
      .catch(() => active && setState('invalid'));
    return () => {
      active = false;
    };
  }, [key]);
  return state;
}
