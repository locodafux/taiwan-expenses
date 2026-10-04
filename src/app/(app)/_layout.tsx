import { Redirect, Stack } from 'expo-router';

import { GoalCelebration } from '@/components/GoalCelebration';
import { UpdateBanner } from '@/components/UpdateBanner';
import { WhatsNew } from '@/components/WhatsNew';
import { useAuth } from '@/lib/auth';
import { useOpenChatOnPushTap, usePushRegistration } from '@/lib/notifications';
import { useHouseholdMembership } from '@/lib/queries';
import { useRealtimeSync } from '@/lib/realtime';

export default function AppLayout() {
  const { session, initializing } = useAuth();
  const { data: member } = useHouseholdMembership();
  useRealtimeSync(member?.household_id);
  usePushRegistration(member?.notifications_enabled);
  useOpenChatOnPushTap();
  if (initializing) return null;
  if (!session) return <Redirect href="/(auth)" />;

  return (
    <>
      <GoalCelebration householdId={member?.household_id} />
      <UpdateBanner />
      <WhatsNew />
      {/* Every screen but the tabs is reached from Settings (Income under Your profile, Feedback,
          Summary of all) and keeps its own back button. */}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}
