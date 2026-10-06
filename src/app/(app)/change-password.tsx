import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ScreenHeader } from '@/components/ui/Heading';
import { KeyboardScroll } from '@/components/ui/KeyboardScroll';
import { TextField } from '@/components/ui/TextField';
import { useAuth } from '@/lib/auth';
import { validatePassword, validatePasswordConfirm } from '@/lib/validation';

const inputClass = 'rounded-md border border-border bg-page px-4 py-3 font-body text-base text-ink';

// Reached from Settings. Asks for the current password first so a phone left
// unlocked can't be used to take over the account.
export default function ChangePassword() {
  const router = useRouter();
  const { changePassword } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function save() {
    const err = (!current && 'Enter your current password') || validatePassword(next) || validatePasswordConfirm(next, confirm);
    if (err) return setResult({ ok: false, message: err });
    setResult(null);
    setSubmitting(true);
    try {
      await changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      setResult({ ok: true, message: 'Password changed.' });
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : 'Could not change password.' });
    } finally {
      setSubmitting(false);
    }
  }

  const edit = (set: (t: string) => void) => (t: string) => {
    set(t);
    setResult(null);
  };

  return (
    <SafeAreaView className="flex-1 bg-page" edges={['top']}>
      <KeyboardScroll contentContainerClassName="gap-4 px-6 py-5">
        <Pressable
          onPress={() => router.navigate('/(app)/settings')}
          hitSlop={13}
          accessibilityRole="button"
          className="self-start py-3"
        >
          <Text className="font-body text-sm text-ink-2">‹ Settings</Text>
        </Pressable>
        <ScreenHeader title="Change password" />
        <Card className="gap-3 p-4">
          <Text className="font-body text-xs text-ink-muted">Current password</Text>
          <TextField
            value={current}
            onChangeText={edit(setCurrent)}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            accessibilityLabel="Current password"
            className={inputClass}
          />
          <Text className="mt-2 font-body text-xs text-ink-muted">New password</Text>
          <TextField
            value={next}
            onChangeText={edit(setNext)}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            accessibilityLabel="New password"
            className={inputClass}
          />
          <Text className="mt-2 font-body text-xs text-ink-muted">Confirm new password</Text>
          <TextField
            value={confirm}
            onChangeText={edit(setConfirm)}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            accessibilityLabel="Confirm new password"
            onSubmitEditing={save}
            className={inputClass}
          />
          {result && (
            <Text
              accessibilityLiveRegion="polite"
              className={`font-body text-sm ${result.ok ? 'text-status-good' : 'text-status-bad'}`}
            >
              {result.message}
            </Text>
          )}
          <Button variant="primary" loading={submitting} onPress={save}>
            Change password
          </Button>
        </Card>
      </KeyboardScroll>
    </SafeAreaView>
  );
}
