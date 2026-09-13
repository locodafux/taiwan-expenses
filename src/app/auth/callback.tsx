import { Redirect } from 'expo-router';

// Matches the `redirectTo` passed to signInWithOAuth (Linking.createURL('auth/callback')).
// Without a route here, Expo Router has nothing to match the OAuth redirect to and shows
// its default "Unmatched Route" screen instead of completing sign-in - this happens on
// every Google sign-in, not just when Android kills the backgrounded app mid-flow.
//
// The redirect's tokens are applied by the Linking listener in AuthProvider (src/lib/auth.tsx),
// not here, so this route only needs to land somewhere that reacts to the resulting session -
// (auth)/_layout already redirects to /(app) once one exists.
export default function AuthCallback() {
  return <Redirect href="/(auth)" />;
}
