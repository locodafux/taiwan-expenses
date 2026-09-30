import { DrawerContentScrollView, type DrawerContentComponentProps } from 'expo-router/drawer';
import { Pressable, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui/Icon';
import { useAuth } from '@/lib/auth';
import { useHousehold, useHouseholdMembership, useUnreadMessageCount } from '@/lib/queries';
import { useTheme } from '@/theme/ThemeProvider';

export const DRAWER_ITEMS: { name: string; label: string; icon: IconName }[] = [
  { name: 'index', label: 'Dashboard', icon: 'home' },
  { name: 'checklist', label: 'Checklist', icon: 'checklist' },
  { name: 'categories', label: 'Categories', icon: 'tabs' },
  { name: 'chat', label: 'Chat', icon: 'chat' },
  { name: 'settings', label: 'Settings', icon: 'sliders' },
];

// The household name and email that used to sit at the top of the Dashboard
// live here now, above the same five destinations the bottom bar had.
export function AppDrawerContent({ state, navigation, ...scrollProps }: DrawerContentComponentProps) {
  const { vars } = useTheme();
  const { session } = useAuth();
  const { data: member } = useHouseholdMembership();
  const { data: household } = useHousehold(member?.household_id);
  const { data: unreadMessages } = useUnreadMessageCount(member?.household_id);
  const activeName = state.routes[state.index]?.name;

  return (
    <DrawerContentScrollView {...scrollProps} contentContainerClassName="px-4 pb-6">
      <View className="mb-4 gap-0.5 rounded-lg bg-accent-soft px-4 py-4">
        <Text className="font-display text-xl text-ink">{household?.name ?? 'Our household'}</Text>
        {session?.user.email ? (
          <Text className="font-body text-sm text-ink-2" numberOfLines={1}>
            {session.user.email}
          </Text>
        ) : null}
      </View>
      {DRAWER_ITEMS.map(({ name, label, icon }) => {
        const focused = activeName === name;
        const color = focused ? vars['--accent'] : vars['--ink-2'];
        return (
          <Pressable
            key={name}
            accessibilityRole="button"
            accessibilityState={{ selected: focused }}
            onPress={() => navigation.navigate(name)}
            className={`flex-row items-center gap-3 rounded-full px-4 py-3 active:opacity-70 ${focused ? 'bg-accent-soft' : ''}`}
          >
            <Icon name={icon} size={22} color={color} strokeWidth={focused ? 2.2 : 1.7} />
            <Text className={`flex-1 font-body-semibold text-md ${focused ? 'text-accent' : 'text-ink-2'}`}>{label}</Text>
            {name === 'chat' && unreadMessages ? (
              <View className="min-w-[20px] items-center rounded-full bg-accent px-1.5 py-0.5">
                <Text className="font-body-semibold text-xs text-white">{unreadMessages}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </DrawerContentScrollView>
  );
}
