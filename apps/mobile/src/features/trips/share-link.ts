// Sharing a trip's link (D-031): the native share sheet on iOS/Android, the browser's on web,
// or a copy to the clipboard where the browser has none. Platform APIs are injected.
import * as Linking from 'expo-linking';
import { Platform, Share } from 'react-native';

export type ShareOutcome = 'shared' | 'copied' | 'dismissed';

export type ShareDeps = {
  platform: typeof Platform.OS;
  nativeShare: (link: { url: string; title: string }) => Promise<'shared' | 'dismissed'>;
  /** `navigator.share`, when the browser has one. */
  webShare?: (link: { url: string; title: string }) => Promise<void>;
  copyText: (text: string) => Promise<void>;
};

export type LinkSharer = { share: (url: string, title: string) => Promise<ShareOutcome> };

/**
 * The link that opens a trip for other people: `<web url>/shared?id=<id>` when the public web
 * address is configured (EXPO_PUBLIC_WEB_URL), else the app's own link for this platform.
 * @example tripShareUrl('t1', 'https://wayfarer.app') // 'https://wayfarer.app/shared?id=t1'
 */
export function tripShareUrl(
  tripId: string,
  webUrl: string | undefined,
  createUrl: typeof Linking.createURL = Linking.createURL,
): string {
  if (!webUrl) return createUrl('shared', { queryParams: { id: tripId } });
  return `${webUrl.replace(/\/+$/, '')}/shared?id=${encodeURIComponent(tripId)}`;
}

async function shareOnWeb(deps: ShareDeps, url: string, title: string): Promise<ShareOutcome> {
  if (!deps.webShare) {
    await deps.copyText(url);
    return 'copied';
  }
  try {
    await deps.webShare({ url, title });
    return 'shared';
  } catch {
    // The user closed the browser's share sheet (AbortError): nothing to report.
    return 'dismissed';
  }
}

/**
 * @example await createLinkSharer(platformShareDeps()).share(url, trip.name) // 'copied' on desktop web
 */
export function createLinkSharer(deps: ShareDeps): LinkSharer {
  return {
    share: (url, title) =>
      deps.platform === 'web' ? shareOnWeb(deps, url, title) : deps.nativeShare({ url, title }),
  };
}

/** The real share APIs of the running platform. */
export function platformShareDeps(): ShareDeps {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  return {
    platform: Platform.OS,
    nativeShare: async ({ url, title }) => {
      // iOS shares `url`; Android only reads `message`.
      const result = await Share.share({ url, message: url, title });
      return result.action === Share.dismissedAction ? 'dismissed' : 'shared';
    },
    webShare: nav?.share ? (link) => nav.share(link) : undefined,
    copyText: async (text) => {
      if (!nav?.clipboard) throw new Error(`No clipboard to copy the link ${text} to`);
      await nav.clipboard.writeText(text);
    },
  };
}
