'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

type PortalAccessGateProps = {
  verifyUrl: string;
  loginPath: string;
  sessionKey: string;
  children: React.ReactNode;
  loadingMessage?: string;
};

export function PortalAccessGate({
  verifyUrl,
  loginPath,
  sessionKey,
  children,
  loadingMessage = 'Checking authentication...',
}: PortalAccessGateProps) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const checkAccess = async () => {
      try {
        const hasTab =
          typeof window !== 'undefined' && Boolean(sessionStorage.getItem(sessionKey));

        if (!hasTab) {
          if (!cancelled) {
            router.replace(loginPath);
          }
          return;
        }

        const response = await fetch(verifyUrl, {
          method: 'GET',
          credentials: 'include',
        });

        if (!response.ok) {
          if (!cancelled) {
            router.replace(loginPath);
          }
          return;
        }

        if (!cancelled) {
          setReady(true);
        }
      } catch {
        if (!cancelled) {
          router.replace(loginPath);
        }
      }
    };

    checkAccess();

    return () => {
      cancelled = true;
    };
  }, [loginPath, router, sessionKey, verifyUrl]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-blue-50">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600" />
          <p className="mt-4 text-blue-600">{loadingMessage}</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
