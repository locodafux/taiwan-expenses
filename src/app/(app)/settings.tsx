import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card, ListRow } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { ErrorState } from '@/components/ui/ErrorState';
import { KeyboardScroll } from '@/components/ui/KeyboardScroll';
import { TextField } from '@/components/ui/TextField';
import { ThemeSwitcher } from '@/components/ui/ThemeSwitcher';
import { WhatsNewSheet } from '@/components/WhatsNew';
import { useAuth } from '@/lib/auth';
import { CHANGELOG } from '@/lib/changelog';
import {
  combineQueryState,
  useCreateInvite,
  useHousehold,
  useHouseholdMembers,
  useHouseholdMembership,
  useSetAutoCheckPastPaydays,
  useSetNotificationsEnabled,
  useUpdateDisplayName,
  useUpdateHouseholdName,
} from '@/lib/queries';
import { validateDisplayName, validatePassword } from '@/lib/validation';
import { useTheme } from '@/theme/ThemeProvider';

const THEME_DESCRIPTIONS = {
  original: "Direction A — the original planner's palette, evolved for touch.",
  warm: 'Sunday Market — sage, apricot and butter on cream. Default.',
  playful: 'Direction C — bold violet-to-pink accent, playful fintech feel.',
};

export default function Settings() {
  const { theme, setTheme, vars } = useTheme();
  const router = useRouter();
  const { session, signOut, deleteAccount, changePassword } = useAuth();
  const membershipQuery = useHouseholdMembership();
  const member = membershipQuery.data;
  const householdQuery = useHousehold(member?.household_id);
  const household = householdQuery.data;
  const membersQuery = useHouseholdMembers(member?.household_id);
  const members = membersQuery.data;
  const createInvite = useCreateInvite();
  const updateHouseholdName = useUpdateHouseholdName(member?.household_id);
  const updateDisplayName = useUpdateDisplayName(member?.household_id);
  const setNotificationsEnabled = useSetNotificationsEnabled();
  const setAutoCheck = useSetAutoCheckPastPaydays(member?.household_id);

  const { isError, refetch } = combineQueryState(membershipQuery, householdQuery, membersQuery);

  const [invite, setInvite] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [profileResult, setProfileResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordResult, setPasswordResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [showDangerZone, setShowDangerZone] = useState(false);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
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

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

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
      <KeyboardScroll contentContainerClassName="gap-4 px-6 py-5">
        <Text className="font-display-semibold text-lg text-ink">Settings</Text>

        <View>
          <Text className="mb-2 font-body-semibold text-sm text-ink">Your profile</Text>
          <Card className="gap-3 p-4">
            <Text className="font-body text-xs text-ink-muted">Your name (how your partner sees you)</Text>
            <TextField
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
            <TextField
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
          <Card className="mt-3">
            <ListRow isLast onPress={() => router.push('/(app)/income')}>
              <Icon name="peso" size={20} color={vars['--ink-2']} />
              <Text className="flex-1 font-body text-base text-ink">Income</Text>
              <Icon name="chevronRight" size={16} color={vars['--ink-muted']} />
            </ListRow>
          </Card>
        </View>

        <View>
          <Text className="mb-2 font-body-semibold text-sm text-ink">Notifications</Text>
          <Card className="flex-row items-center gap-3 p-4">
            <View className="flex-1">
              <Text className="font-body text-base text-ink">Push notifications</Text>
              <Text className="font-body text-xs leading-[1.55] text-ink-muted">
                Bills due tomorrow, payday checklists, and when your partner pays a bill or adds something.
              </Text>
            </View>
            <Switch
              accessibilityLabel="Push notifications"
              value={setNotificationsEnabled.isPending ? setNotificationsEnabled.variables : (member?.notifications_enabled ?? true)}
              disabled={!member || setNotificationsEnabled.isPending}
              onValueChange={(v) =>
                setNotificationsEnabled.mutate(v, {
                  onError: (e) => Alert.alert('Could not update notifications', e.message),
                })
              }
              trackColor={{ true: vars['--accent'] }}
            />
          </Card>
        </View>

        <View>
          <Text className="mb-2 font-body-semibold text-sm text-ink">Checklist</Text>
          <Card className="flex-row items-center gap-3 p-4">
            <View className="flex-1">
              <Text className="font-body text-base text-ink">Tick off past paydays automatically</Text>
              <Text className="font-body text-xs leading-[1.55] text-ink-muted">
                When a new cutoff starts, anything left unticked on the last one is marked done. Applies
                to both of you.
              </Text>
            </View>
            <Switch
              accessibilityLabel="Tick off past paydays automatically"
              value={setAutoCheck.isPending ? setAutoCheck.variables : (household?.auto_check_past_paydays ?? false)}
              disabled={!household || setAutoCheck.isPending}
              onValueChange={(v) =>
                setAutoCheck.mutate(v, {
                  onError: (e) => Alert.alert('Could not update the checklist setting', e.message),
                })
              }
              trackColor={{ true: vars['--accent'] }}
            />
          </Card>
        </View>

        <View>
          <Text className="mb-2 font-body-semibold text-sm text-ink">Look and feel</Text>
          <ThemeSwitcher value={theme} onChange={setTheme} />
          <Text className="mt-3 font-body text-xs leading-[1.55] text-ink-muted">
            {THEME_DESCRIPTIONS[theme]}
          </Text>
        </View>

        <View>
          <Text className="mb-2 font-body-semibold text-sm text-ink">Household</Text>
          {isEditingName ? (
            <TextField
              autoFocus
              value={nameDraft}
              onChangeText={setNameDraft}
              onBlur={saveName}
              onSubmitEditing={saveName}
              className="mb-2 rounded-md border border-border bg-page px-4 py-4 font-body text-base text-ink"
            />
          ) : (
            <Pressable
              className="mb-2"
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
          <Text className="mb-2 font-body-semibold text-sm text-ink">Invite your partner</Text>
          <Card className="gap-3 p-4">
            {invite ? (
              <View className="flex-row items-center justify-between gap-3">
                <Text selectable className="flex-1 font-mono text-lg text-ink">
                  {invite}
                </Text>
                <Button
                  variant="secondary"
                  size="sm"
                  accessibilityLabel="Copy invite code"
                  onPress={async () => {
                    await Clipboard.setStringAsync(invite);
                    setCopied(true);
                  }}
                >
                  {copied ? 'Copied ✓' : 'Copy'}
                </Button>
              </View>
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
                  setCopied(false);
                } catch (e) {
                  setInviteError(e instanceof Error ? e.message : 'Could not generate invite code');
                }
              }}
            >
              {invite ? 'Generate a new code' : 'Generate invite code'}
            </Button>
          </Card>
        </View>

        <Card>
          <ListRow onPress={() => router.push('/(app)/feedback')}>
            <Icon name="chat" size={20} color={vars['--ink-2']} />
            <View className="flex-1">
              <Text className="font-body text-base text-ink">Feedback</Text>
              <Text className="font-body text-xs text-ink-muted">Report a problem or suggest an idea, and see what&apos;s done.</Text>
            </View>
            <Icon name="chevronRight" size={16} color={vars['--ink-muted']} />
          </ListRow>
          <ListRow isLast onPress={() => setShowWhatsNew(true)}>
            <Icon name="sparkle" size={20} color={vars['--ink-2']} />
            <Text className="flex-1 font-body text-base text-ink">What’s new</Text>
            <Icon name="chevronRight" size={16} color={vars['--ink-muted']} />
          </ListRow>
        </Card>

        <View className="border-t border-border pt-5">
          <Button variant="ghost" onPress={() => signOut()}>
            Sign out
          </Button>
        </View>

        {/* Collapsed by default so Delete account isn't in view every visit. */}
        <View className="gap-3 border-t border-border pt-5">
          <Pressable
            onPress={() => setShowDangerZone((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showDangerZone }}
            className="flex-row items-center justify-between py-1"
          >
            <Text className="font-body-semibold text-sm text-status-bad">Danger zone</Text>
            <Text className="font-body text-sm text-ink-muted">{showDangerZone ? 'Hide' : 'Show'}</Text>
          </Pressable>
          {showDangerZone && (
            <Button variant="ghost" loading={isDeleting} onPress={confirmDeleteAccount}>
              Delete account
            </Button>
          )}
        </View>
      </KeyboardScroll>
      <WhatsNewSheet entries={CHANGELOG} visible={showWhatsNew} onClose={() => setShowWhatsNew(false)} />
    </SafeAreaView>
  );
}
