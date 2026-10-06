import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { ScreenHeader } from '@/components/ui/Heading';
import { KeyboardScroll } from '@/components/ui/KeyboardScroll';
import { TextField } from '@/components/ui/TextField';
import { useAuth } from '@/lib/auth';
import { validateEmail } from '@/lib/validation';

export default function ForgotPassword() {
  const router = useRouter();
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function send() {
    const err = validateEmail(email);
    if (err) return setError(err);
    setError(null);
    setSubmitting(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch {
      // Supabase doesn't error for unknown emails, so this is a network/rate-limit
      // problem; keep the message generic either way.
      setError('Could not send the reset email. Check your connection and try again in a minute.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-page">
      <KeyboardScroll contentContainerClassName="gap-5 px-6 py-6">
        <ScreenHeader
          title="Forgot password?"
          subtitle="Enter your email and we'll send you a link to set a new password."
        />
        <View>
          <Text className="font-body text-xs text-ink-muted">Email</Text>
          <TextField
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              setError(null);
            }}
            placeholder="leo@email.com"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            accessibilityLabel="Email"
            onSubmitEditing={send}
            className="mt-2 rounded-md border border-border bg-surface px-4 py-4 font-body text-base text-ink"
          />
        </View>
        {error && <Text className="font-body text-sm text-status-bad">{error}</Text>}
        {sent && (
          <Callout>
            If an account exists for that email, a reset link is on its way. Open it on this phone. It can
            take a minute to arrive, so check your spam folder too.
          </Callout>
        )}
        <Button variant="primary" loading={submitting} onPress={send}>
          {sent ? 'Send again' : 'Send reset link'}
        </Button>
        <Pressable onPress={() => router.back()} hitSlop={13} className="self-start py-3">
          <Text className="font-body text-sm text-ink-muted">‹ Back to sign in</Text>
        </Pressable>
      </KeyboardScroll>
    </SafeAreaView>
  );
}
