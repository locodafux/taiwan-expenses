import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card, ListRow } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { ThemeSwitcher } from '@/components/ui/ThemeSwitcher';
import { useAuth } from '@/lib/auth';
import {
  combineQueryState,
  useCreateInvite,
  useHousehold,
  useHouseholdMembers,
  useHouseholdMembership,
  useSubmitBugReport,
  useUpdateDisplayName,
  useUpdateHouseholdName,
} from '@/lib/queries';
import { validateDisplayName, validatePassword } from '@/lib/validation';
import { useTheme } from '@/theme/ThemeProvider';

const THEME_DESCRIPTIONS = {
  original: "Direction A — the original planner's palette, evolved for touch.",
  warm: 'Direction B — terracotta, deep teal and cream. Default.',
  playful: 'Direction C — bold violet-to-pink accent, playful fintech feel.',
};

export default function Settings() {
  const { theme, setTheme } = useTheme();
  const { session, signOut, deleteAccount, changePassword } = useAuth();
  const membershipQuery = useHouseholdMembership();
  const member = membershipQuery.data;
  const householdQuery = useHousehold(member?.household_id);
  const household = householdQuery.data;
  const membersQuery = useHouseholdMembers(member?.household_id);
  const members = membersQuery.data;
  const createInvite = useCreateInvite();
  const updateHouseholdName = useUpdateHouseholdName(member?.household_id);
  const submitBugReport = useSubmitBugReport(member?.household_id);
  const updateDisplayName = useUpdateDisplayName(member?.household_id);

  const { isError, refetch } = combineQueryState(membershipQuery, householdQuery, membersQuery);

  const [invite, setInvite] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [bugDraft, setBugDraft] = useState('');
  const [bugResult, setBugResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [profileResult, setProfileResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordResult, setPasswordResult] = useState<{ ok: boolean; message: string } | null>(null);
  const hasPartner = (members?.length ?? 0) > 1;

  function confirmDeleteAccount() {
    Alert.alert(
      'Delete your account?',
      (hasPartner
        ? 'Your account and your own data (membership, income entries) will be permanently deleted. Shared categories, bills and ledger history stay in the household for your partner.'
        : 'Your account and all of your household data - categories, bills, incomes and ledger history - will be permanently deleted.') +
        ' This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              await deleteAccount();
            } catch (e) {
              setIsDeleting(false);
              Alert.alert('Could not delete account', e instanceof Error ? e.message : 'Try again.');
            }
          },
        },
      ],
    );
  }

  async function saveProfileName() {
    const name = (profileName ?? '').trim();
    const err = validateDisplayName(name);
    if (err) return setProfileResult({ ok: false, message: err });
    setProfileResult(null);
    try {
      await updateDisplayName.mutateAsync(name);
      setProfileName(null);
      setProfileResult({ ok: true, message: 'Name saved.' });
    } catch (e) {
      setProfileResult({ ok: false, message: e instanceof Error ? e.message : 'Could not save name. Try again.' });
    }
  }

  async function savePassword() {
    const err = validatePassword(newPassword);
    if (err) return setPasswordResult({ ok: false, message: err });
    setPasswordResult(null);
    setIsChangingPassword(true);
    try {
      await changePassword(newPassword);
      setNewPassword('');
      setPasswordResult({ ok: true, message: 'Password changed.' });
    } catch (e) {
      setPasswordResult({ ok: false, message: e instanceof Error ? e.message : 'Could not change password.' });
    } finally {
      setIsChangingPassword(false);
    }
  }

  async function sendBugReport() {
    const description = bugDraft.trim();
    if (!description) return setBugResult({ ok: false, message: 'Describe what went wrong first.' });
    setBugResult(null);
    try {
      await submitBugReport.mutateAsync(description);
      setBugDraft('');
      setBugResult({ ok: true, message: 'Thanks - your report was sent.' });
    } catch (e) {
      setBugResult({ ok: false, message: e instanceof Error ? e.message : 'Could not send report. Try again.' });
    }
  }

  const saveName = async () => {
    const trimmed = nameDraft.trim();
    setIsEditingName(false);
    if (!trimmed || trimmed === household?.name) return;
    try {
      await updateHouseholdName.mutateAsync(trimmed);
    } catch {
      // ponytail: no toast infra for this screen yet; the field snaps back to
      // the last-known name via useHousehold's cached data on failure.
    }
  };

  if (isError) {
    return (
      <SafeAreaView className="flex-1 bg-page">
        <ErrorState onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-page" edges={['top']}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerClassName="gap-5 px-6 py-5"
          className="flex-1"
          keyboardShouldPersistTaps="handled"
        >
          <Text className="font-display-semibold text-lg text-ink">Settings</Text>

          <View>
            <Text className="mb-3 font-body-semibold text-sm text-ink">Your profile</Text>
            <Card className="gap-3 p-5">
              <Text className="font-body text-xs text-ink-muted">Your name (how your partner sees you)</Text>
              <TextInput
                value={profileName ?? member?.display_name ?? ''}
                onChangeText={(t) => {
                  setProfileName(t);
                  setProfileResult(null);
                }}
                onSubmitEditing={saveProfileName}
                accessibilityLabel="Your name"
                maxLength={50}
                className="rounded-md border border-border bg-page px-4 py-3 font-body text-base text-ink"
              />
              {profileResult && (
                <Text className={`font-body text-sm ${profileResult.ok ? 'text-status-good' : 'text-status-bad'}`}>
                  {profileResult.message}
                </Text>
              )}
              {profileName !== null && profileName.trim() !== member?.display_name && (
                <Button variant="secondary" loading={updateDisplayName.isPending} onPress={saveProfileName}>
                  Save name
                </Button>
              )}

              <Text className="mt-2 font-body text-xs text-ink-muted">Email</Text>
              <Text className="font-body text-base text-ink">{session?.user.email ?? '-'}</Text>

              <Text className="mt-2 font-body text-xs text-ink-muted">New password</Text>
              <TextInput
                value={newPassword}
                onChangeText={(t) => {
                  setNewPassword(t);
                  setPasswordResult(null);
                }}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                accessibilityLabel="New password"
                className="rounded-md border border-border bg-page px-4 py-3 font-body text-base text-ink"
              />
              {passwordResult && (
                <Text className={`font-body text-sm ${passwordResult.ok ? 'text-status-good' : 'text-status-bad'}`}>
                  {passwordResult.message}
                </Text>
              )}
              <Button variant="secondary" loading={isChangingPassword} onPress={savePassword}>
                Change password
              </Button>
            </Card>
          </View>

          <View>
            <Text className="mb-3 font-body-semibold text-sm text-ink">Look and feel</Text>
            <ThemeSwitcher value={theme} onChange={setTheme} />
            <Text className="mt-3 font-body text-xs leading-[1.55] text-ink-muted">
              {THEME_DESCRIPTIONS[theme]}
            </Text>
          </View>

          <View>
            <Text className="mb-3 font-body-semibold text-sm text-ink">Household</Text>
            {isEditingName ? (
              <TextInput
                autoFocus
                value={nameDraft}
                onChangeText={setNameDraft}
                onBlur={saveName}
                onSubmitEditing={saveName}
                className="mb-3 rounded-md border border-border bg-page px-4 py-4 font-body text-base text-ink"
              />
            ) : (
              <Pressable
                className="mb-3"
                onPress={() => {
                  setNameDraft(household?.name ?? '');
                  setIsEditingName(true);
                }}
              >
                <Text className="font-body text-base text-ink">{household?.name ?? 'Our household'}</Text>
              </Pressable>
            )}
            <Card>
              {(members ?? []).map((m, i) => (
                <ListRow key={m.id} isLast={i === (members?.length ?? 0) - 1}>
                  <Avatar initial={m.display_name[0]?.toUpperCase() ?? '?'} color={m.color ?? '#999'} />
                  <Text className="font-body text-base text-ink">{m.display_name}</Text>
                </ListRow>
              ))}
            </Card>
          </View>

          <View>
            <Text className="mb-3 font-body-semibold text-sm text-ink">Invite your partner</Text>
            <Card className="gap-3 p-5">
              {invite ? (
                <Text className="font-mono text-lg text-ink">{invite}</Text>
              ) : (
                <Text className="font-body text-sm text-ink-muted">
                  Generate a one-time code your partner can enter when they sign up.
                </Text>
              )}
              {inviteError && <Text className="font-body text-sm text-status-bad">{inviteError}</Text>}
              <Button
                variant="secondary"
                loading={createInvite.isPending}
                onPress={async () => {
                  setInviteError(null);
                  try {
                    const result = await createInvite.mutateAsync();
                    setInvite(result.code);
                  } catch (e) {
                    setInviteError(e instanceof Error ? e.message : 'Could not generate invite code');
                  }
                }}
              >
                {invite ? 'Generate a new code' : 'Generate invite code'}
              </Button>
            </Card>
          </View>

          <View>
            <Text className="mb-3 font-body-semibold text-sm text-ink">Report a bug</Text>
            <Card className="gap-3 p-5">
              <TextInput
                multiline
                value={bugDraft}
                onChangeText={setBugDraft}
                placeholder="What went wrong? Steps to reproduce help too."
                accessibilityLabel="Bug description"
                className="min-h-24 rounded-md border border-border bg-page px-4 py-3 font-body text-base text-ink"
                textAlignVertical="top"
              />
              {bugResult && (
                <Text className={`font-body text-sm ${bugResult.ok ? 'text-status-good' : 'text-status-bad'}`}>
                  {bugResult.message}
                </Text>
              )}
              <Button variant="secondary" loading={submitBugReport.isPending} onPress={sendBugReport}>
                Send report
              </Button>
            </Card>
          </View>

          <View className="border-t border-border pt-6">
            <Button variant="ghost" onPress={() => signOut()}>
              Sign out
            </Button>
          </View>

          <View className="gap-3 border-t border-border pt-6">
            <Text className="font-body-semibold text-sm text-status-bad">Danger zone</Text>
            <Button variant="ghost" loading={isDeleting} onPress={confirmDeleteAccount}>
              Delete account
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
