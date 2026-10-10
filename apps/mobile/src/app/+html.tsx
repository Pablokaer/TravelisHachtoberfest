import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren, ReactElement } from 'react';

// Public site origin: link-preview crawlers need absolute image URLs (D-073).
const SITE_URL = 'https://travelist.live';
const SITE_TITLE = 'Travelist';
const SITE_DESCRIPTION = 'Turn any city into your personal travel list.';
const PREVIEW_IMAGE = `${SITE_URL}/og-image.png`;

/** Root HTML of the static web export: favicon, home-screen icons and the link-preview card. */
export default function RootHtml({ children }: PropsWithChildren): ReactElement {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="theme-color" content="#D7383B" />
        <meta name="description" content={SITE_DESCRIPTION} />

        <link rel="icon" href="/favicon.ico" sizes="48x48" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />

        <meta property="og:type" content="website" />
        <meta property="og:site_name" content={SITE_TITLE} />
        <meta property="og:title" content={SITE_TITLE} />
        <meta property="og:description" content={SITE_DESCRIPTION} />
        <meta property="og:url" content={SITE_URL} />
        <meta property="og:image" content={PREVIEW_IMAGE} />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="Travelist logo: a white swallow on a red tile" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={SITE_TITLE} />
        <meta name="twitter:description" content={SITE_DESCRIPTION} />
        <meta name="twitter:image" content={PREVIEW_IMAGE} />

        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
