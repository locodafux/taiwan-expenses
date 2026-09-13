import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/lib/auth';

export default function AuthLayout() {
  const { session, initializing } = useAuth();
  if (initializing) return null;
  if (session) return <Redirect href="/(app)" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
