"use client";

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { clearConsoleTabSession, hasConsoleTabSession } from '@/lib/utils';

export default function EvidenceVerificationLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isPublicRoute =
    pathname === '/evidence-verification/login' || pathname === '/evidence-verification/change-password';

  const [ready, setReady] = useState(isPublicRoute);

  useEffect(() => {
    if (isPublicRoute) return;

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
  }, [isPublicRoute, router]);

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
