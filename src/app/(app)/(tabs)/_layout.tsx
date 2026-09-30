import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';

import { Icon, type IconName } from '@/components/ui/Icon';
import { useHouseholdMembership, useUnreadMessageCount } from '@/lib/queries';
import { THEMES } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

function tabIcon(name: IconName) {
  return function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Icon name={name} size={22} color={color as string} strokeWidth={focused ? 2.2 : 1.7} />;
  };
}

// The four everyday screens. The side drawer's own header (menu button) sits above this,
// so the tabs draw no header of their own.
export default function TabsLayout() {
  const { theme } = useTheme();
  const { data: member } = useHouseholdMembership();
  const { data: unreadMessages } = useUnreadMessageCount(member?.household_id);
  const vars = THEMES[theme];

  return (
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
      <Tabs.Screen name="index" options={{ title: 'Dashboard', tabBarIcon: tabIcon('home') }} />
      <Tabs.Screen name="checklist" options={{ title: 'Checklist', tabBarIcon: tabIcon('checklist') }} />
      <Tabs.Screen name="categories" options={{ title: 'Categories', tabBarIcon: tabIcon('tabs') }} />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: tabIcon('chat'),
          tabBarBadge: unreadMessages ? unreadMessages : undefined,
          tabBarBadgeStyle: { backgroundColor: vars['--accent'], color: '#fff9f4', fontSize: 10 },
        }}
      />
    </Tabs>
  );
}
