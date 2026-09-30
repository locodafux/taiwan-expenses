import { Redirect } from 'expo-router';
import { Drawer, DrawerToggleButton } from 'expo-router/drawer';
import { View } from 'react-native';

import { GoalCelebration } from '@/components/GoalCelebration';
import { AppDrawerContent } from '@/components/AppDrawer';
import { UpdateBanner } from '@/components/UpdateBanner';
import { WhatsNew } from '@/components/WhatsNew';
import { useAuth } from '@/lib/auth';
import { useOpenChatOnPushTap, usePushRegistration } from '@/lib/notifications';
import { useHouseholdMembership, useUnreadMessageCount } from '@/lib/queries';
import { useRealtimeSync } from '@/lib/realtime';
import { THEMES } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

const HIDDEN_SCREENS = ['income', 'feedback', 'breakdown', 'summary'];

export default function AppLayout() {
  const { session, initializing } = useAuth();
  const { theme } = useTheme();
  const { data: member } = useHouseholdMembership();
  const { data: unreadMessages } = useUnreadMessageCount(member?.household_id);
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
          // The bottom bar's unread-chat badge is gone with it, so the menu button carries a dot instead.
          headerLeft: (props) => (
            <View>
              <DrawerToggleButton {...props} />
              {unreadMessages ? (
                <View
                  className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-accent"
                  accessibilityLabel="Unread chat messages"
                />
              ) : null}
            </View>
          ),
          headerShadowVisible: false,
          headerStyle: { backgroundColor: vars['--page'] },
          headerTintColor: vars['--ink'],
          drawerStyle: { backgroundColor: vars['--surface'], width: 300 },
          drawerType: 'front',
        }}
      >
        <Drawer.Screen name="index" options={{ title: 'Dashboard' }} />
        <Drawer.Screen name="checklist" options={{ title: 'Checklist' }} />
        <Drawer.Screen name="categories" options={{ title: 'Categories' }} />
        <Drawer.Screen name="full-numbers" options={{ title: 'Full numbers' }} />
        <Drawer.Screen name="chat" options={{ title: 'Chat' }} />
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
