import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { ScreenHeader } from '@/components/ui/Heading';
import { KeyboardScroll } from '@/components/ui/KeyboardScroll';
import { TextField } from '@/components/ui/TextField';
import { useAuth } from '@/lib/auth';
import { parseRecoveryLink } from '@/lib/recoveryLink';
import { validatePassword, validatePasswordConfirm } from '@/lib/validation';

const inputClass = 'mt-2 rounded-md border border-border bg-surface px-4 py-4 font-body text-base text-ink';

// Target of the reset email's deep link (taiwanfundplanner://reset-password#...).
// Lives outside the (auth)/(app) groups on purpose: the link signs the user in,
// and (auth)'s layout would bounce a signed-in user away before they set a password.
export default function ResetPassword() {
  const router = useRouter();
  const url = Linking.useLinkingURL();
  const { startRecoverySession, resetPassword } = useAuth();
  const [exchange, setExchange] = useState<'pending' | 'ready' | 'failed'>('pending');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // The URL arrives a moment after mount on a cold start, so `link` is null-ish until then.
  const link = parseRecoveryLink(url);
  const tokens = link.kind === 'tokens' ? link : null;
  const accessToken = tokens?.accessToken;
  const refreshToken = tokens?.refreshToken;

  useEffect(() => {
    if (!accessToken || !refreshToken) return;
    startRecoverySession(accessToken, refreshToken).then(
      () => setExchange('ready'),
      () => setExchange('failed'),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per link
  }, [accessToken, refreshToken]);

  let status: 'checking' | 'ready' | 'invalid' = 'checking';
  let linkError = 'This reset link is not valid. Request a new one.';
  if (tokens) {
    if (exchange === 'ready') status = 'ready';
    else if (exchange === 'failed') {
      status = 'invalid';
      linkError = 'This reset link has expired or was already used. Request a new one.';
    }
  } else if (url) {
    status = 'invalid';
    if (link.kind === 'error') linkError = link.message;
  }

  async function save() {
    const err = validatePassword(password) || validatePasswordConfirm(password, confirm);
    if (err) return setError(err);
    setError(null);
    setSubmitting(true);
    try {
      await resetPassword(password);
      router.replace('/(app)');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not set the new password. Try again.');
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-page">
      <KeyboardScroll contentContainerClassName="gap-5 px-6 py-6">
        <ScreenHeader title="Set a new password" />
        {status === 'checking' && <Text className="font-body text-sm text-ink-2">Checking your reset link…</Text>}
        {status === 'invalid' && (
          <>
            <Callout>{linkError}</Callout>
            <Button variant="primary" onPress={() => router.replace('/(auth)/forgot-password')}>
              Request a new link
            </Button>
            <Pressable onPress={() => router.replace('/(auth)')} hitSlop={13} className="self-start py-3">
              <Text className="font-body text-sm text-ink-muted">‹ Back to sign in</Text>
            </Pressable>
          </>
        )}
        {status === 'ready' && (
          <>
            <Text className="font-body text-xs text-ink-muted">New password</Text>
            <TextField
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                setError(null);
              }}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              accessibilityLabel="New password"
              className={inputClass}
            />
            <Text className="font-body text-xs text-ink-muted">Confirm new password</Text>
            <TextField
              value={confirm}
              onChangeText={(t) => {
                setConfirm(t);
                setError(null);
              }}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              accessibilityLabel="Confirm new password"
              onSubmitEditing={save}
              className={inputClass}
            />
            {error && <Text className="font-body text-sm text-status-bad">{error}</Text>}
            <Button variant="primary" loading={submitting} onPress={save}>
              Set new password
            </Button>
          </>
        )}
      </KeyboardScroll>
    </SafeAreaView>
  );
}
