import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/states';

/**
 * "City not found" with a way back to the Home, for a city URL with an unknown slug.
 * @example if (!city) return <CityNotFound />;
 */
export function CityNotFound() {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon="globe"
      title={t('home.cityNotFound')}
      body={t('home.cityNotFoundBody')}
      action={
        <Button icon="globe" label={t('home.backHome')} onPress={() => router.navigate('/')} />
      }
    />
  );
}
