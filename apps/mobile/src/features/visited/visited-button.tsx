// "I've been here" on an attraction's page (D-085): marks the place as visited so suggested
// routes stop treating it as a priority, and shows the mark so a tap can undo it.
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { useAuth } from '@/features/auth/auth-provider';
import { useSetVisited, useVisitedIds } from './api';

/**
 * @example <VisitedButton attractionId={attraction.id} />
 */
export function VisitedButton({ attractionId }: { attractionId: string }) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const visitedIds = useVisitedIds();
  const setVisited = useSetVisited();
  if (!session) return null;
  const visited = visitedIds.data?.has(attractionId) ?? false;
  return (
    <Button
      testID="toggle-visited"
      icon={visited ? 'check' : 'flag'}
      variant={visited ? 'primary' : 'secondary'}
      label={visited ? t('visited.done') : t('visited.mark')}
      accessibilityHint={visited ? t('visited.undoHint') : t('visited.markHint')}
      loading={setVisited.isPending}
      onPress={() => setVisited.mutate({ attractionId, visited: !visited })}
    />
  );
}
