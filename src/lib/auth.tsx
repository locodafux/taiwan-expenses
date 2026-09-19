import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

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
  changePassword: (password: string) => Promise<void>;
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
      async changePassword(password) {
        const { error } = await supabase.auth.updateUser({ password });
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
