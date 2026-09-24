import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { supabase } from './supabase';

// Pushes are sent server-side (supabase/migrations/20260921000040_notifications.sql);
// the app's only job is getting this device's Expo push token into push_tokens.
let registeredToken: string | null = null;

export async function registerForPushNotifications() {
  if (Platform.OS === 'web') return;

  Notifications.setNotificationHandler({
    // Only runs while the app is open. A chat push is redundant then - the
    // Chat tab's unread badge and realtime already show the new message.
    handleNotification: async (notification) => {
      const show = notification.request.content.data?.type !== 'chat';
      return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: false, shouldSetBadge: false };
    },
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Reminders, activity and chat',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
  if (status !== 'granted') return;

  const { data: token } = await Notifications.getExpoPushTokenAsync({
    projectId: Constants.expoConfig?.extra?.eas?.projectId,
  });
  const { error } = await supabase.rpc('register_push_token', { p_token: token });
  if (error) throw error;
  registeredToken = token;
}

// Called before sign-out, while the session can still delete its own row, so
// the next person to sign in on this phone doesn't get the previous user's pushes.
export async function unregisterPushToken() {
  if (!registeredToken) return;
  await supabase.from('push_tokens').delete().eq('token', registeredToken);
  registeredToken = null;
}

// Registers whenever the user's master switch is on. Turning it off keeps the
// token - the server skips users with notifications_enabled = false.
export function usePushRegistration(enabled: boolean | undefined) {
  useEffect(() => {
    if (!enabled) return;
    registerForPushNotifications().catch((e) =>
      // Expected in Expo Go (no remote push since SDK 53) and on builds without
      // Firebase configured; the rest of the app works regardless.
      console.warn('Push registration failed:', e instanceof Error ? e.message : e),
    );
  }, [enabled]);
}

// Tapping a chat push (app open, backgrounded or killed) opens the Chat tab.
export function useOpenChatOnPushTap() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const open = (response: Notifications.NotificationResponse | null) => {
      if (response?.notification.request.content.data?.type !== 'chat') return;
      // Cleared so a later remount (sign out and back in) doesn't jump to Chat again.
      Notifications.clearLastNotificationResponse();
      router.navigate('/(app)/chat');
    };
    open(Notifications.getLastNotificationResponse());
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, []);
}
