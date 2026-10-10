import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/states';

export default function NotFoundScreen() {
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ title: '404' }} />
      <EmptyState
        icon="pin"
        title={t('errors.notFound')}
        action={
          <Button icon="home" label={t('errors.goHome')} onPress={() => router.replace('/')} />
        }
      />
    </>
  );
}
