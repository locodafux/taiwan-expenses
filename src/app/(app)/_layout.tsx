import { Redirect, Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';

import { GoalCelebration } from '@/components/GoalCelebration';
import { Icon, type IconName } from '@/components/ui/Icon';
import { UpdateBanner } from '@/components/UpdateBanner';
import { WhatsNew } from '@/components/WhatsNew';
import { useAuth } from '@/lib/auth';
import { useOpenChatOnPushTap, usePushRegistration } from '@/lib/notifications';
import { useHouseholdMembership, useUnreadMessageCount } from '@/lib/queries';
import { useRealtimeSync } from '@/lib/realtime';
import { THEMES } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

function tabIcon(name: IconName) {
  return function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Icon name={name} size={22} color={color as string} strokeWidth={focused ? 2.2 : 1.7} />;
  };
}

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
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: vars['--ink'],
          tabBarInactiveTintColor: vars['--ink-muted'],
          tabBarStyle: {
            backgroundColor: vars['--surface'],
            // Sits on the page by tone alone, like the cards: no rule, no shadow.
            borderTopWidth: 0,
            elevation: 0,
          },
          tabBarLabelStyle: { fontFamily: 'Figtree_600SemiBold', fontSize: 11 },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{ title: 'Dashboard', tabBarIcon: tabIcon('home') }}
        />
        <Tabs.Screen
          name="checklist"
          options={{ title: 'Checklist', tabBarIcon: tabIcon('checklist') }}
        />
        <Tabs.Screen
          name="categories"
          options={{ title: 'Categories', tabBarIcon: tabIcon('tabs') }}
        />
        <Tabs.Screen
          name="chat"
          options={{
            title: 'Chat',
            tabBarIcon: tabIcon('chat'),
            tabBarBadge: unreadMessages ? unreadMessages : undefined,
            tabBarBadgeStyle: { backgroundColor: vars['--accent'], color: '#fff9f4', fontSize: 10 },
          }}
        />
        <Tabs.Screen
          name="income"
          // Lives under Settings -> Your profile now (bug report: "hide the income bar").
          options={{ title: 'Income', href: null }}
        />
        <Tabs.Screen
          name="feedback"
          // Reached from Settings -> Feedback.
          options={{ title: 'Feedback', href: null }}
        />
        <Tabs.Screen
          name="settings"
          options={{ title: 'Settings', tabBarIcon: tabIcon('sliders') }}
        />
      </Tabs>
    </>
  );
}
