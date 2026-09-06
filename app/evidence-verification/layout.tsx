"use client";

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import {
  getLaunchBlockedRedirectPath,
  isLaunchBlockedPath,
} from '@/lib/access-control';
import { ConsoleAuthPendingScreen, useConsoleAuthGate } from '@/lib/console-auth-gate';

export default function EvidenceVerificationLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const launchBlocked = isLaunchBlockedPath(pathname || '/evidence-verification');
  const isPublicRoute =
    pathname === '/evidence-verification/login' || pathname === '/evidence-verification/change-password';

  const authState = useConsoleAuthGate({
    isPublicRoute: launchBlocked || isPublicRoute,
    tabSessionKey: 'evidence_verification_tab_session',
    verifyUrl: '/api/evidence-verification/verify',
    loginPath: '/evidence-verification/login',
  });

  useEffect(() => {
    if (!launchBlocked) return;
    router.replace(getLaunchBlockedRedirectPath(pathname || '/evidence-verification'));
  }, [launchBlocked, pathname, router]);

  if (launchBlocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600" />
          <p className="mt-4 text-blue-600">Redirecting...</p>
        </div>
      </div>
    );
  }

  if (isPublicRoute) {
    return (
      <div className="flex min-h-screen flex-col">
        <div className="flex flex-1 flex-col bg-background">{children}</div>
      </div>
    );
  }

  if (authState !== 'authed') {
    return <ConsoleAuthPendingScreen />;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex flex-1 flex-col bg-background">{children}</div>
    </div>
  );
}
