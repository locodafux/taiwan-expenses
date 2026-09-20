import { useCallback, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { TextField } from '@/components/ui/TextField';
import { useAuth } from '@/lib/auth';
import {
  combineQueryState,
  useHouseholdMembers,
  useHouseholdMembership,
  useMarkMessagesRead,
  useMessages,
  useSendMessage,
} from '@/lib/queries';
import type { Message } from '@/lib/database.types';

function formatSentAt(iso: string) {
  const sent = new Date(iso);
  const time = sent.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (sent.toDateString() === new Date().toDateString()) return time;
  return `${sent.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

function MessageRow({
  message,
  mine,
  name,
  color,
}: {
  message: Message;
  mine: boolean;
  name: string;
  color: string;
}) {
  return (
    <View className={`flex-row items-end gap-3 px-6 py-2 ${mine ? 'justify-end' : ''}`}>
      {!mine && <Avatar initial={name[0]?.toUpperCase() ?? '?'} color={color} size={26} />}
      <View className={`max-w-[78%] rounded-lg px-4 py-3 ${mine ? 'bg-accent-soft' : 'bg-surface'}`}>
        {!mine && <Text className="font-body-semibold text-xs text-ink-2">{name}</Text>}
        <Text className="font-body text-base text-ink">{message.body}</Text>
        <Text className="mt-[2px] font-body text-xs text-ink-muted">{formatSentAt(message.created_at)}</Text>
      </View>
    </View>
  );
}

export default function Chat() {
  const { session } = useAuth();
  const membershipQuery = useHouseholdMembership();
  const householdId = membershipQuery.data?.household_id;
  const messagesQuery = useMessages(householdId);
  const membersQuery = useHouseholdMembers(householdId);
  const sendMessage = useSendMessage(householdId);
  const markRead = useMarkMessagesRead(householdId);

  const { isError, refetch } = combineQueryState(membershipQuery, messagesQuery, membersQuery);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const messages = messagesQuery.data ?? [];
  const newestId = messages[0]?.id;

  // Clear the tab badge whenever this screen is focused - and again if a
  // message arrives while it stays focused (the tab navigator keeps every
  // screen mounted, so an effect on the data alone would also fire from
  // another tab).
  useFocusEffect(
    useCallback(() => {
      if (newestId) void markRead();
    }, [markRead, newestId]),
  );

  async function handleSend() {
    const body = draft.trim();
    if (!body || !householdId) return;
    setError(null);
    try {
      await sendMessage.mutateAsync(body);
      setDraft('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send that message');
    }
  }

  if (isError) {
    return (
      <SafeAreaView className="flex-1 bg-page">
        <ErrorState onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-page" edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View className="px-6 py-5">
          <Text className="font-display-semibold text-lg text-ink">Household chat</Text>
        </View>

        <FlatList
          // Inverted + newest-first data keeps the latest message pinned to the
          // bottom and in view as new ones arrive, without scroll bookkeeping.
          inverted
          data={messages}
          keyExtractor={(m) => m.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingVertical: 8 }}
          renderItem={({ item }) => {
            const sender = (membersQuery.data ?? []).find((m) => m.user_id === item.sender_id);
            return (
              <MessageRow
                message={item}
                mine={!!item.sender_id && item.sender_id === session?.user.id}
                name={sender?.display_name ?? 'Someone'}
                color={sender?.color ?? '#999'}
              />
            );
          }}
          ListEmptyComponent={
            <View className="items-center px-10 py-10">
              <Text className="text-center font-body text-sm text-ink-muted">
                No messages yet. Say hi to your household.
              </Text>
            </View>
          }
        />

        {error && <Text className="px-6 pb-2 font-body text-sm text-status-bad">{error}</Text>}

        <View className="flex-row items-end gap-3 border-t border-border bg-surface px-6 py-4">
          <TextField
            value={draft}
            onChangeText={setDraft}
            placeholder="Message your household"
            multiline
            className="max-h-24 flex-1 rounded-md border border-border bg-page px-4 py-3 font-body text-base text-ink"
          />
          <Button size="sm" loading={sendMessage.isPending} disabled={!draft.trim()} onPress={handleSend}>
            Send
          </Button>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
