import { Redirect } from 'expo-router';
import { Drawer, DrawerToggleButton } from 'expo-router/drawer';

import { GoalCelebration } from '@/components/GoalCelebration';
import { AppDrawerContent } from '@/components/AppDrawer';
import { UpdateBanner } from '@/components/UpdateBanner';
import { WhatsNew } from '@/components/WhatsNew';
import { useAuth } from '@/lib/auth';
import { useOpenChatOnPushTap, usePushRegistration } from '@/lib/notifications';
import { useHouseholdMembership } from '@/lib/queries';
import { useRealtimeSync } from '@/lib/realtime';
import { THEMES } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

const HIDDEN_SCREENS = ['income', 'feedback', 'breakdown', 'summary'];

export default function AppLayout() {
  const { session, initializing } = useAuth();
  const { theme } = useTheme();
  const { data: member } = useHouseholdMembership();
  useRealtimeSync(member?.household_id);
  usePushRegistration(member?.notifications_enabled);
  useOpenChatOnPushTap();
  if (initializing) return null;
  if (!session) return <Redirect href="/(auth)" />;

  const vars = THEMES[theme];

  return (
    <>
      <GoalCelebration householdId={member?.household_id} />
      <UpdateBanner />
      <WhatsNew />
      <Drawer
        drawerContent={(props) => <AppDrawerContent {...props} />}
        screenOptions={{
          // Just the menu button on the page's own tone; each screen keeps its own title.
          headerTitle: '',
          headerLeft: (props) => <DrawerToggleButton {...props} />,
          headerShadowVisible: false,
          headerStyle: { backgroundColor: vars['--page'] },
          headerTintColor: vars['--ink'],
          drawerStyle: { backgroundColor: vars['--surface'], width: 300 },
          drawerType: 'front',
        }}
      >
        {/* The four everyday screens live in the bottom tab bar; the drawer holds the rest. */}
        <Drawer.Screen name="(tabs)" options={{ drawerItemStyle: { display: 'none' } }} />
        <Drawer.Screen name="full-numbers" options={{ title: 'Full numbers' }} />
        <Drawer.Screen name="settings" options={{ title: 'Settings' }} />
        {/* Reached from Settings (Income under Your profile, Feedback, Breakdown, Summary of all):
            not in the drawer, and they keep their own back button instead of the menu header. */}
        {HIDDEN_SCREENS.map((name) => (
          <Drawer.Screen
            key={name}
            name={name}
            options={{ headerShown: false, drawerItemStyle: { display: 'none' } }}
          />
        ))}
      </Drawer>
    </>
  );
}
