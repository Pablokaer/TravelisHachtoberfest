import { focusManager, QueryClient } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';

/** What we need of React Native's AppState, so tests can pass a fake. */
export type AppStateLike = {
  addEventListener: (event: 'change', listener: (state: string) => void) => { remove: () => void };
};

/**
 * Turns the app coming back to the foreground into query "focus" on iOS/Android (the web uses
 * the tab's visibility). Only queries that opt in refetch on focus — today the group chat
 * (D-044); the default stays off.
 * @example focusManager.setEventListener(appStateFocus(AppState))
 */
export function appStateFocus(appState: AppStateLike) {
  return (setFocused: (focused: boolean) => void) => {
    const subscription = appState.addEventListener('change', (state) =>
      setFocused(state === 'active'),
    );
    return () => subscription.remove();
  };
}

export function createQueryClient() {
  if (Platform.OS !== 'web') focusManager.setEventListener(appStateFocus(AppState));
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        retry: 2,
        refetchOnWindowFocus: false,
      },
    },
  });
}
