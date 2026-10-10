import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, use, useEffect, useState, type PropsWithChildren } from 'react';

import { useFeatures } from '@/lib/features';
import { supabase } from '@/lib/supabase';

type AuthState = { session: Session | null; isLoading: boolean };

const AuthContext = createContext<AuthState>({ session: null, isLoading: true });

/**
 * Local mode (D-078) has no sign-in screen, but trips and the profile belong to a user: with no
 * session yet, Supabase Auth creates an anonymous one, kept in the browser like any session.
 */
async function sessionOrAnonymous(session: Session | null, localMode: boolean) {
  if (session || !localMode) return session;
  const { data, error } = await supabase.auth.signInAnonymously();
  return error ? null : data.session;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AuthState>({ session: null, isLoading: true });
  const queryClient = useQueryClient();
  const { localMode } = useFeatures();

  useEffect(() => {
    let mounted = true;
    supabase.auth
      .getSession()
      .then(({ data }) => sessionOrAnonymous(data.session, localMode))
      .then((session) => mounted && setState({ session, isLoading: false }))
      .catch(() => mounted && setState({ session: null, isLoading: false }));

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setState({ session, isLoading: false });
      if (event === 'SIGNED_OUT') queryClient.clear();
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [queryClient, localMode]);

  return <AuthContext value={state}>{children}</AuthContext>;
}

export function useAuth() {
  return use(AuthContext);
}
