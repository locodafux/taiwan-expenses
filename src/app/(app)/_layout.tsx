import { Redirect, Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';

import { GoalCelebration } from '@/components/GoalCelebration';
import { useAuth } from '@/lib/auth';
import { useHouseholdMembership } from '@/lib/queries';
import { useRealtimeSync } from '@/lib/realtime';
import { THEMES } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

function TabIcon({ symbol, color }: { symbol: string; color: ColorValue }) {
  return <Text style={{ fontSize: 18, color }}>{symbol}</Text>;
}

export default function AppLayout() {
  const { session, initializing } = useAuth();
  const { theme } = useTheme();
  const { data: member } = useHouseholdMembership();
  useRealtimeSync(member?.household_id);
  if (initializing) return null;
  if (!session) return <Redirect href="/(auth)" />;

  const vars = THEMES[theme];

  return (
    <>
      <GoalCelebration householdId={member?.household_id} />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: vars['--accent'],
          tabBarInactiveTintColor: vars['--ink-muted'],
          tabBarStyle: {
            backgroundColor: vars['--surface'],
            borderTopColor: vars['--border'],
            elevation: 8,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.05,
            shadowRadius: 6,
          },
          tabBarLabelStyle: { fontFamily: 'PublicSans_600SemiBold', fontSize: 11 },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{ title: 'Dashboard', tabBarIcon: ({ color }) => <TabIcon symbol="⌂" color={color} /> }}
        />
        <Tabs.Screen
          name="checklist"
          options={{ title: 'Checklist', tabBarIcon: ({ color }) => <TabIcon symbol="✓" color={color} /> }}
        />
        <Tabs.Screen
          name="categories"
          options={{ title: 'Categories', tabBarIcon: ({ color }) => <TabIcon symbol="▤" color={color} /> }}
        />
        <Tabs.Screen
          name="income"
          options={{ title: 'Income', tabBarIcon: ({ color }) => <TabIcon symbol="₱" color={color} /> }}
        />
        <Tabs.Screen
          name="settings"
          options={{ title: 'Settings', tabBarIcon: ({ color }) => <TabIcon symbol="⚙" color={color} /> }}
        />
      </Tabs>
    </>
  );
}
