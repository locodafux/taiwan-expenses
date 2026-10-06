import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { unregisterPushToken } from './notifications';
import { supabase } from './supabase';

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
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  /** Signed-in change: re-verifies the current password first. */
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  /** Turns the access/refresh tokens from the reset email link into a session. */
  startRecoverySession: (accessToken: string, refreshToken: string) => Promise<void>;
  /** Sets the new password on the recovery session; no current password needed. */
  resetPassword: (newPassword: string) => Promise<void>;
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

    return () => sub.subscription.unsubscribe();
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
      async signOut() {
        await unregisterPushToken().catch(() => {});
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      },
      async deleteAccount() {
        const { error } = await supabase.rpc('delete_own_account');
        if (error) throw error;
        // The account no longer exists server-side; clear the local session
        // too so AppLayout's session check redirects back to (auth).
        await supabase.auth.signOut();
      },
      async changePassword(currentPassword, newPassword) {
        const email = session?.user.email;
        if (!email) throw new Error('You need to be signed in to change your password.');
        const { error: verifyError } = await supabase.auth.signInWithPassword({
          email,
          password: currentPassword,
        });
        if (verifyError) {
          if (verifyError.code === 'invalid_credentials') throw new Error('Your current password is incorrect.');
          throw verifyError;
        }
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) throw error;
      },
      async requestPasswordReset(email) {
        // Must match a redirect URL allowed in the Supabase project's Auth settings.
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: Linking.createURL('reset-password'),
        });
        if (error) throw error;
      },
      async startRecoverySession(accessToken, refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) throw error;
      },
      async resetPassword(newPassword) {
        const { error } = await supabase.auth.updateUser({ password: newPassword });
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
