// A walk list's group chat (D-043), /walk-chat?id=<trip id>: for its organiser and everyone
// going. Others are invited to say they are going; private or missing lists have no chat.
// While the walk chat is hidden (D-065) the address leads back to the walk list itself, so an
// old link or bookmark lands somewhere useful and no chat is read or followed.
import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { PageHeader, useGutter } from '@/components/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { isChatMember } from '@/features/chat/membership';
import { ChatParticipants } from '@/features/chat/participants';
import { WalkChat } from '@/features/chat/walk-chat';
import { useSharedTrip } from '@/features/trips/sharing-api';
import { useFeatures } from '@/lib/features';
import { layout, spacing } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

/**
 * The route: the chat when the walk chat is on, otherwise the walk list (D-065).
 * @example router.push(walkChatHref(trip.id))
 */
export default function WalkChatRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { walkChat } = useFeatures();
  if (!walkChat) return <Redirect href={{ pathname: '/shared', params: { id: id ?? '' } }} />;
  return <WalkChatScreen id={id} />;
}

function WalkChatScreen({ id }: { id: string | undefined }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const gutter = useGutter();
  const shared = useSharedTrip(id, null);
  if (shared.isPending) return <LoadingState />;
  if (shared.isError || !shared.data) return <ErrorState onRetry={() => shared.refetch()} />;
  if (shared.data.status !== 'ok')
    return (
      <EmptyState icon="lock" title={t('sharing.notFoundTitle')} body={t('sharing.notFoundBody')} />
    );
  const trip = shared.data.trip;
  const openList = () => router.push({ pathname: '/shared', params: { id: trip.id } });
  if (!isChatMember(trip))
    return (
      <EmptyState
        icon="person"
        title={t('chat.notMemberTitle')}
        body={t('chat.notMemberBody')}
        action={<Button label={t('chat.openList')} onPress={openList} />}
      />
    );
  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safe, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: t('chat.title') }} />
      <View
        style={[styles.page, { maxWidth: layout.content + gutter * 2, paddingHorizontal: gutter }]}>
        <PageHeader size="title" title={trip.name} subtitle={t('chat.subtitle')} />
        <ChatParticipants tripId={trip.id} />
        <WalkChat tripId={trip.id} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  page: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
});
