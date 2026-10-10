// A walk list's group chat (D-043): messages oldest first (own ones on the right), and a field
// to write. New messages from anyone arrive live (useWalkChatLive).
import type { TFunction } from 'i18next';
import { useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { ErrorState, LoadingState } from '@/components/states';
import { Text } from '@/components/text';
import { AuthorName } from '@/features/profile/author-name';
import { TextField } from '@/components/text-field';
import {
  CHAT_MESSAGE_MAX,
  useSendWalkMessage,
  useWalkChatLive,
  useWalkMessages,
  type ChatMessage,
} from '@/features/chat/api';
import { radius, spacing } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

/**
 * Who wrote a message: their @nickname (yours too, D-048), else "You" or their name.
 * @example messageAuthorLabel(message, t) // '@nina_walks'
 */
export function messageAuthorLabel(message: ChatMessage, t: TFunction): string {
  if (message.authorNickname) return `@${message.authorNickname}`;
  return message.isOwn ? t('chat.you') : (message.authorName ?? t('reviews.anonymous'));
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const name = messageAuthorLabel(message, t);
  const time = new Intl.DateTimeFormat(t('common.locale'), { timeStyle: 'short' }).format(
    new Date(message.createdAt),
  );
  return (
    <View testID={`chat-message-${message.id}`} style={[styles.row, message.isOwn && styles.own]}>
      {message.isOwn ? null : (
        <Avatar name={message.authorName ?? name} size={32} uri={message.authorAvatarUrl} />
      )}
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: message.isOwn ? theme.primarySoft : theme.surface,
            borderColor: theme.border,
          },
        ]}>
        <Text variant="caption" secondary>
          {message.isOwn ? (
            name
          ) : (
            <AuthorName name={name} publicId={message.authorPublicId} variant="caption" />
          )}{' '}
          · {time}
        </Text>
        <Text>{message.body}</Text>
      </View>
    </View>
  );
}

function Composer({ tripId }: { tripId: string }) {
  const { t } = useTranslation();
  const send = useSendWalkMessage(tripId);
  const [draft, setDraft] = useState('');
  const submit = () => {
    const body = draft.trim();
    if (!body) return;
    send.mutate(body, { onSuccess: () => setDraft('') });
  };
  return (
    <View style={styles.composer}>
      <View style={styles.flex}>
        <TextField
          label={t('chat.placeholder')}
          value={draft}
          onChangeText={setDraft}
          maxLength={CHAT_MESSAGE_MAX}
          onSubmitEditing={submit}
          error={send.error ? 'chat.sendError' : undefined}
          testID="chat-input"
        />
      </View>
      <Button icon="share" label={t('chat.send')} loading={send.isPending} onPress={submit} />
    </View>
  );
}

/**
 * @example <WalkChat tripId={trip.id} />
 */
export function WalkChat({ tripId }: { tripId: string }) {
  const { t } = useTranslation();
  const messages = useWalkMessages(tripId);
  const list = useRef<FlatList<ChatMessage>>(null);
  useWalkChatLive(tripId);
  return (
    // Keeps the field above the keyboard on iOS/Android; the web needs nothing.
    <KeyboardAvoidingView
      testID="chat-keyboard"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 96 : 0}
      style={styles.chat}>
      {messages.isPending ? (
        <LoadingState />
      ) : messages.isError ? (
        <ErrorState message={t('chat.error')} onRetry={() => messages.refetch()} />
      ) : (
        <FlatList
          ref={list}
          data={messages.data}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.messages}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => <MessageBubble message={item} />}
          ListEmptyComponent={
            <Text secondary style={styles.empty}>
              {t('chat.empty')}
            </Text>
          }
          accessibilityLiveRegion="polite"
        />
      )}
      <Composer tripId={tripId} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  chat: { flex: 1, gap: spacing.md },
  messages: { gap: spacing.sm, paddingVertical: spacing.sm, flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, maxWidth: '85%' },
  own: { alignSelf: 'flex-end' },
  bubble: {
    flexShrink: 1,
    gap: spacing.xxs,
    padding: spacing.sm + 2,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  empty: { textAlign: 'center', marginTop: spacing.xl },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
});
