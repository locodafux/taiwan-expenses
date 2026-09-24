import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Card, ListRow } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { ErrorState } from '@/components/ui/ErrorState';
import { KeyboardScroll } from '@/components/ui/KeyboardScroll';
import { TextField } from '@/components/ui/TextField';
import type { BugReport } from '@/lib/database.types';
import {
  combineQueryState,
  useFeedback,
  useHouseholdMembers,
  useHouseholdMembership,
  useSubmitFeedback,
} from '@/lib/queries';
import { useTheme } from '@/theme/ThemeProvider';

const STATUS: Record<BugReport['status'], { label: string; className: string }> = {
  open: { label: 'Open', className: 'border border-border' },
  planned: { label: 'Planned', className: 'bg-butter' },
  done: { label: 'Done', className: 'bg-sage-soft' },
};

// Bug reports and feature requests (stored in bug_reports), plus the whole
// household's list so each member can see what's already been sent and done.
export default function Feedback() {
  const { vars } = useTheme();
  const router = useRouter();
  const membershipQuery = useHouseholdMembership();
  const member = membershipQuery.data;
  const householdId = member?.household_id;
  const membersQuery = useHouseholdMembers(householdId);
  const feedbackQuery = useFeedback(householdId);
  const submitFeedback = useSubmitFeedback(householdId);

  const { isError, refetch } = combineQueryState(membershipQuery, membersQuery, feedbackQuery);

  const [draft, setDraft] = useState('');
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function send() {
    const description = draft.trim();
    if (!description) return setResult({ ok: false, message: 'Write something first.' });
    setResult(null);
    try {
      await submitFeedback.mutateAsync(description);
      setDraft('');
      setResult({ ok: true, message: 'Thanks - your feedback was sent.' });
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : 'Could not send feedback. Try again.' });
    }
  }

  // The success note is a transient confirmation, not a state - clear it after
  // a few seconds so the form reads as ready for another item.
  useEffect(() => {
    if (!result?.ok) return;
    const t = setTimeout(() => setResult(null), 4000);
    return () => clearTimeout(t);
  }, [result]);

  function senderName(userId: string | null) {
    if (userId && userId === member?.user_id) return 'You';
    return membersQuery.data?.find((m) => m.user_id === userId)?.display_name ?? 'Former member';
  }

  if (isError) {
    return (
      <SafeAreaView className="flex-1 bg-page">
        <ErrorState onRetry={refetch} />
      </SafeAreaView>
    );
  }

  const items = feedbackQuery.data ?? [];

  return (
    <SafeAreaView className="flex-1 bg-page" edges={['top']}>
      <KeyboardScroll contentContainerClassName="gap-4 px-6 py-5">
        {/* Not a tab - reached from Settings. */}
        <Pressable
          onPress={() => router.navigate('/(app)/settings')}
          hitSlop={13}
          accessibilityRole="button"
          className="self-start py-3"
        >
          <Text className="font-body text-sm text-ink-2">‹ Settings</Text>
        </Pressable>
        <Text className="font-display-semibold text-lg text-ink">Feedback</Text>

        <Card className="gap-3 p-4">
          <TextField
            multiline
            value={draft}
            onChangeText={setDraft}
            placeholder="Something broken, confusing, or an idea? Tell us."
            accessibilityLabel="Feedback"
            className="min-h-24 rounded-md border border-border bg-page px-4 py-3 font-body text-base text-ink"
            textAlignVertical="top"
          />
          {result && !result.ok && <Text className="font-body text-sm text-status-bad">{result.message}</Text>}
          {result?.ok && (
            <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(300)}>
              <View
                accessibilityLiveRegion="polite"
                className="flex-row items-center gap-3 rounded-lg rounded-bl-sm bg-sage-soft px-4 py-3"
              >
                <Icon name="check" size={22} strokeWidth={2.6} color={vars['--accent-2']} />
                <View className="flex-1">
                  <Text className="font-body-semibold text-sm text-ink">{result.message}</Text>
                  <Text className="font-body text-xs text-ink-2">It&apos;s in the list below.</Text>
                </View>
              </View>
            </Animated.View>
          )}
          <Button variant="secondary" loading={submitFeedback.isPending} onPress={send}>
            Send feedback
          </Button>
        </Card>

        <View>
          <Text className="mb-2 font-body-semibold text-sm text-ink">Sent by your household</Text>
          {items.length === 0 ? (
            <Text className="font-body text-sm text-ink-muted">
              {feedbackQuery.isLoading ? 'Loading…' : 'Nothing sent yet.'}
            </Text>
          ) : (
            <Card>
              {items.map((f, i) => (
                <ListRow key={f.id} isLast={i === items.length - 1}>
                  <View className="flex-1 gap-1">
                    <Text className="font-body text-base text-ink">{f.description}</Text>
                    <Text className="font-body text-xs text-ink-muted">
                      {senderName(f.user_id)} ·{' '}
                      {new Date(f.created_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </Text>
                  </View>
                  <View className={`self-start rounded-full px-2 py-0.5 ${STATUS[f.status].className}`}>
                    <Text className="font-body-medium text-xs text-ink">{STATUS[f.status].label}</Text>
                  </View>
                </ListRow>
              ))}
            </Card>
          )}
        </View>
      </KeyboardScroll>
    </SafeAreaView>
  );
}
