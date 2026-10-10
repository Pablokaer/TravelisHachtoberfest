import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { ErrorState, LoadingState } from '@/components/states';
import { completeAuthFromUrl } from '@/features/auth/api';

/** Landing page for magic links, email confirmation and OAuth redirects (PKCE code exchange). */
export default function AuthCallbackScreen() {
  const { t } = useTranslation();
  const url = Linking.useLinkingURL();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    completeAuthFromUrl(url)
      .then(() => router.replace('/'))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [url]);

  return (
    <Screen scroll={false}>
      {error ? (
        <>
          <ErrorState message={error} />
          <Button label={t('auth.backToSignIn')} onPress={() => router.replace('/sign-in')} />
        </>
      ) : (
        <LoadingState label={t('auth.signingIn')} />
      )}
    </Screen>
  );
}
