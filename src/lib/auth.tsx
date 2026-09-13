import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

type SignUpOptions = {
  displayName: string;
  householdName?: string;
  inviteCode?: string;
};

type AuthContextValue = {
  session: Session | null;
  initializing: boolean;
  signUp: (email: string, password: string, opts: SignUpOptions) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setInitializing(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    // Applying the OAuth redirect here, rather than in the auth/callback route itself,
    // sidesteps a mount-order race: Linking.useURL() inside a route that Expo Router
    // navigates to *because of* an incoming url event subscribes only after that event
    // has already fired, so it never sees the URL that triggered the navigation. A
    // listener registered once at provider mount (well before any redirect) doesn't
    // have this problem. getInitialURL() covers the case where Android killed the
    // backgrounded app during the OAuth flow and it cold-starts on the redirect.
    Linking.getInitialURL().then((url) => {
      if (url) applySessionFromUrl(url).catch(() => {});
    });
    const linkingSub = Linking.addEventListener('url', (event) => {
      applySessionFromUrl(event.url).catch(() => {});
    });

    return () => {
      sub.subscription.unsubscribe();
      linkingSub.remove();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      initializing,
      async signUp(email, password, { displayName, householdName, inviteCode }) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: displayName,
              household_name: householdName,
              invite_code: inviteCode || undefined,
            },
          },
        });
        if (error) throw error;
      },
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      },
      async signInWithGoogle() {
        // Native OAuth flow per Supabase's documented Expo pattern: get the
        // provider URL and open it in an auth session. The redirect back to
        // `redirectTo` is applied by the Linking listener set up in this
        // provider's effect above, not here - see that comment for why.
        const redirectTo = Linking.createURL('auth/callback');
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo, skipBrowserRedirect: true },
        });
        if (error) throw error;
        if (!data.url) throw new Error('No OAuth URL returned from Supabase');

        await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      },
      async signOut() {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      },
    }),
    [session, initializing],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export async function applySessionFromUrl(url: string): Promise<boolean> {
  const params = new URL(url).hash
    ? new URLSearchParams(new URL(url).hash.slice(1))
    : new URLSearchParams(new URL(url).search);
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) return false;

  const { error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) throw error;
  return true;
}
