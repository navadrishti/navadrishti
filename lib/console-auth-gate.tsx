'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clearConsoleTabSession, hasConsoleTabSession } from '@/lib/utils';

export type ConsoleAuthGateState = 'public' | 'pending' | 'authed' | 'redirecting';

/**
 * Auth gate for special consoles (admin / CA / evidence / govt-admin).
 * Avoids flashing portal chrome + skeletons before redirecting to login.
 */
export function useConsoleAuthGate(options: {
  isPublicRoute: boolean;
  tabSessionKey: string;
  verifyUrl: string;
  loginPath: string;
}): ConsoleAuthGateState {
  const router = useRouter();
  const { isPublicRoute, tabSessionKey, verifyUrl, loginPath } = options;

  const [state, setState] = useState<ConsoleAuthGateState>(() => {
    if (isPublicRoute) return 'public';
    if (typeof window === 'undefined') return 'pending';
    if (!hasConsoleTabSession(tabSessionKey)) return 'redirecting';
    return 'pending';
  });

  useEffect(() => {
    if (isPublicRoute) {
      setState('public');
      return;
    }

    let cancelled = false;

    const redirectToLogin = () => {
      clearConsoleTabSession(tabSessionKey);
      if (!cancelled) {
        setState('redirecting');
        router.replace(loginPath);
      }
    };

    const checkAccess = async () => {
      try {
        if (!hasConsoleTabSession(tabSessionKey)) {
          redirectToLogin();
          return;
        }

        setState('pending');
        const response = await fetch(verifyUrl, {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        });

        if (!response.ok) {
          redirectToLogin();
          return;
        }

        if (!cancelled) setState('authed');
      } catch {
        redirectToLogin();
      }
    };

    void checkAccess();

    return () => {
      cancelled = true;
    };
  }, [isPublicRoute, loginPath, router, tabSessionKey, verifyUrl]);

  return state;
}

/** Blank screen while redirecting / verifying — no portal chrome flash. */
export function ConsoleAuthPendingScreen() {
  return <div className="min-h-screen bg-background" aria-hidden="true" />;
}
