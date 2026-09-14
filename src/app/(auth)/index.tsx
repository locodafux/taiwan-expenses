import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/auth';
import { validateDisplayName, validateEmail, validateInviteCode, validatePassword } from '@/lib/validation';

type Step = 'welcome' | 'create' | 'join' | 'signin';

const inputClass =
  'mt-2 rounded-md border border-border bg-surface px-4 py-4 font-body text-base text-ink';

export default function Onboarding() {
  const [step, setStep] = useState<Step>('welcome');
  const { signUp, signIn, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [householdName, setHouseholdName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleCreate() {
    const errs = [validateDisplayName(displayName), validateEmail(email), validatePassword(password)].filter(
      (e): e is string => !!e,
    );
    if (errs.length) return setErrors(errs);
    setErrors([]);
    setSubmitting(true);
    try {
      await signUp(email, password, { displayName, householdName: householdName || 'Our household' });
    } catch (e) {
      setErrors([e instanceof Error ? e.message : 'Something went wrong']);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJoin() {
    const errs = [
      validateDisplayName(displayName),
      validateEmail(email),
      validatePassword(password),
      validateInviteCode(inviteCode),
    ].filter((e): e is string => !!e);
    if (errs.length) return setErrors(errs);
    setErrors([]);
    setSubmitting(true);
    try {
      await signUp(email, password, { displayName, inviteCode });
    } catch (e) {
      setErrors([e instanceof Error ? e.message : 'Something went wrong']);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignIn() {
    const errs = [validateEmail(email), validatePassword(password)].filter((e): e is string => !!e);
    if (errs.length) return setErrors(errs);
    setErrors([]);
    setSubmitting(true);
    try {
      await signIn(email, password);
    } catch (e) {
      setErrors([e instanceof Error ? e.message : 'Something went wrong']);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogle() {
    setErrors([]);
    try {
      await signInWithGoogle();
    } catch (e) {
      setErrors([e instanceof Error ? e.message : 'Google sign-in failed']);
    }
  }

  if (step === 'welcome') {
    return (
      <SafeAreaView className="flex-1 bg-page px-7 py-8">
        <View className="flex-1 gap-9">
          <Text className="mt-3 font-display text-2xl leading-[1.1] text-ink">
            Our household,{'\n'}one shared budget.
          </Text>
          <Text className="font-body text-base leading-[1.55] text-ink-2">
            Two sign-ins, one pool of paydays, bills, debt and savings goals — including the Taiwan
            fund.
          </Text>
          <View className="mt-auto gap-3">
            <Button variant="primary" onPress={() => setStep('create')}>
              Sign up
            </Button>
            <Button variant="secondary" onPress={() => setStep('join')}>
              Join with an invite code
            </Button>
            <Button variant="ghost" onPress={() => setStep('signin')}>
              I already have an account
            </Button>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const isJoin = step === 'join';
  const isSignIn = step === 'signin';
  const titles = { create: 'Create your account', join: 'Join a household', signin: 'Sign in' };
  const submitLabels = { create: 'Create account', join: 'Join household', signin: 'Sign in' };
  const submitHandlers = { create: handleCreate, join: handleJoin, signin: handleSignIn };

  return (
    <SafeAreaView className="flex-1 bg-page px-7 py-8">
      <View className="gap-6">
        <Text className="font-display text-xl text-ink">{titles[step]}</Text>
        {isJoin && (
          <Text className="font-body text-sm text-ink-2">
            Got an invite code from your partner? Enter it below to join instead of starting a new
            household.
          </Text>
        )}

        {!isSignIn && (
          <View>
            <Text className="font-body text-xs text-ink-muted">Your name</Text>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="e.g. Leo"
              className={inputClass}
            />
          </View>
        )}
        <View>
          <Text className="font-body text-xs text-ink-muted">Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="leo@email.com"
            autoCapitalize="none"
            keyboardType="email-address"
            className={inputClass}
          />
        </View>
        <View>
          <View className="flex-row items-center justify-between">
            <Text className="font-body text-xs text-ink-muted">Password</Text>
            {!isSignIn && <Text className="font-body text-xs text-ink-muted">Min 8 characters</Text>}
          </View>
          <View className="relative justify-center">
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              accessibilityLabel="Password"
              className={`${inputClass} pr-16`}
            />
            <Pressable
              onPress={() => setShowPassword((v) => !v)}
              hitSlop={13}
              className="absolute right-4"
            >
              <Text className="font-body-semibold text-sm text-accent">
                {showPassword ? 'Hide' : 'Show'}
              </Text>
            </Pressable>
          </View>
        </View>
        {step === 'create' && (
          <View>
            <Text className="font-body text-xs text-ink-muted">Household name (optional)</Text>
            <TextInput
              value={householdName}
              onChangeText={setHouseholdName}
              placeholder="Our household"
              className={inputClass}
            />
          </View>
        )}
        {isJoin && (
          <View>
            <Text className="font-body text-xs text-ink-muted">Invite code</Text>
            <TextInput
              value={inviteCode}
              onChangeText={setInviteCode}
              placeholder="e.g. bcea6b01dbd4"
              autoCapitalize="none"
              className={`${inputClass} font-mono`}
            />
          </View>
        )}

        {errors.length > 0 && (
          <View className="gap-1">
            {errors.map((e) => (
              <Text key={e} className="font-body text-sm text-status-bad">
                {e}
              </Text>
            ))}
          </View>
        )}

        <Button variant="primary" loading={submitting} onPress={submitHandlers[step]}>
          {submitLabels[step]}
        </Button>
        <Button variant="ghost" onPress={handleGoogle}>
          Continue with Google
        </Button>
        <Pressable onPress={() => setStep('welcome')} hitSlop={13} className="self-start py-3">
          <Text className="font-body text-sm text-ink-muted">‹ Back</Text>
        </Pressable>
        {step === 'create' && (
          <Text className="font-body text-xs text-ink-muted">
            First sign-up creates your household. You&apos;ll get an invite code to share next.
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}
