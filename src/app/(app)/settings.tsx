import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card, ListRow } from '@/components/ui/Card';
import { ThemeSwitcher } from '@/components/ui/ThemeSwitcher';
import { useAuth } from '@/lib/auth';
import { useCreateInvite, useHouseholdMembers, useHouseholdMembership } from '@/lib/queries';
import { useTheme } from '@/theme/ThemeProvider';

const THEME_DESCRIPTIONS = {
  original: "Direction A — the original planner's palette, evolved for touch.",
  warm: 'Direction B — terracotta, deep teal and cream. Default.',
  playful: 'Direction C — bold violet-to-pink accent, playful fintech feel.',
};

export default function Settings() {
  const { theme, setTheme } = useTheme();
  const { signOut } = useAuth();
  const { data: member } = useHouseholdMembership();
  const { data: members } = useHouseholdMembers(member?.household_id);
  const createInvite = useCreateInvite();
  const [invite, setInvite] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  return (
    <SafeAreaView className="flex-1 bg-page" edges={['top']}>
      <ScrollView contentContainerClassName="gap-7 px-7 py-6" className="flex-1">
        <Text className="font-display-semibold text-lg text-ink">Settings</Text>

        <View>
          <Text className="mb-3 font-body-semibold text-sm text-ink">Look and feel</Text>
          <ThemeSwitcher value={theme} onChange={setTheme} />
          <Text className="mt-3 font-body text-xs leading-[1.55] text-ink-muted">
            {THEME_DESCRIPTIONS[theme]}
          </Text>
        </View>

        <View>
          <Text className="mb-3 font-body-semibold text-sm text-ink">Household</Text>
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

        <View className="border-t border-border pt-6">
          <Button variant="ghost" onPress={() => signOut()}>
            Sign out
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
