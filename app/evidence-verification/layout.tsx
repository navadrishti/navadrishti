"use client";

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import {
  getLaunchBlockedRedirectPath,
  isLaunchBlockedPath,
} from '@/lib/access-control';
import { clearConsoleTabSession, hasConsoleTabSession } from '@/lib/utils';

export default function EvidenceVerificationLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const launchBlocked = isLaunchBlockedPath(pathname || '/evidence-verification');
  const isPublicRoute =
    pathname === '/evidence-verification/login' || pathname === '/evidence-verification/change-password';

  const [ready, setReady] = useState(isPublicRoute || launchBlocked);

  useEffect(() => {
    if (!launchBlocked) return;
    router.replace(getLaunchBlockedRedirectPath(pathname || '/evidence-verification'));
  }, [launchBlocked, pathname, router]);

  useEffect(() => {
    if (launchBlocked || isPublicRoute) {
      setReady(true);
      return;
    }

    let cancelled = false;

    const checkAccess = async () => {
      try {
        if (!hasConsoleTabSession('evidence_verification_tab_session')) {
          if (!cancelled) router.replace('/evidence-verification/login');
          return;
        }

        const response = await fetch('/api/evidence-verification/verify', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        });

        if (!response.ok) {
          clearConsoleTabSession('evidence_verification_tab_session');
          if (!cancelled) router.replace('/evidence-verification/login');
          return;
        }

        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) router.replace('/evidence-verification/login');
      }
    };

    void checkAccess();

    return () => {
      cancelled = true;
    };
  }, [isPublicRoute, launchBlocked, pathname, router]);

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

  if (!ready) {
    return <div className="min-h-screen bg-background" aria-hidden="true" />;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex flex-1 flex-col bg-background">{children}</div>
    </div>
  );
}
