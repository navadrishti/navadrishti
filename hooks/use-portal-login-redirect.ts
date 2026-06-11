'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type UsePortalLoginRedirectOptions = {
  verifyUrl: string;
  sessionKey: string;
  dashboardPath: string;
  changePasswordPath?: string;
};

export function usePortalLoginRedirect({
  verifyUrl,
  sessionKey,
  dashboardPath,
  changePasswordPath,
}: UsePortalLoginRedirectOptions) {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const checkExistingSession = async () => {
      try {
        const hasTab =
          typeof window !== 'undefined' && Boolean(sessionStorage.getItem(sessionKey));

        if (!hasTab) {
          if (!cancelled) {
            setCheckingAuth(false);
          }
          return;
        }

        const response = await fetch(verifyUrl, {
          method: 'GET',
          credentials: 'include',
        });

        if (!response.ok) {
          if (!cancelled) {
            setCheckingAuth(false);
          }
          return;
        }

        const data = await response.json().catch(() => ({}));
        const mustChangePassword =
          data?.must_change_password === true ||
          data?.mustChangePassword === true ||
          data?.account?.must_change_password === true ||
          data?.identity?.must_change_password === true;

        if (!cancelled) {
          if (mustChangePassword && changePasswordPath) {
            router.replace(changePasswordPath);
          } else {
            router.replace(dashboardPath);
          }
        }
      } catch {
        if (!cancelled) {
          setCheckingAuth(false);
        }
      }
    };

    checkExistingSession();

    return () => {
      cancelled = true;
    };
  }, [changePasswordPath, dashboardPath, router, sessionKey, verifyUrl]);

  return checkingAuth;
}
