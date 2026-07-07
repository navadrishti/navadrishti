"use client";

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

export default function EvidenceVerificationLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isPublicRoute =
    pathname === '/evidence-verification/login' || pathname === '/evidence-verification/change-password';

  useEffect(() => {
    if (isPublicRoute) return;

    let cancelled = false;

    const checkAccess = async () => {
      try {
        const hasTab =
          typeof window !== 'undefined' &&
          Boolean(sessionStorage.getItem('evidence_verification_tab_session'));

        if (!hasTab) {
          if (!cancelled) router.replace('/evidence-verification/login');
          return;
        }

        const response = await fetch('/api/evidence-verification/verify', {
          method: 'GET',
          credentials: 'include',
        });

        if (!response.ok && !cancelled) {
          router.replace('/evidence-verification/login');
        }
      } catch {
        if (!cancelled) router.replace('/evidence-verification/login');
      }
    };

    void checkAccess();

    return () => {
      cancelled = true;
    };
  }, [isPublicRoute, pathname, router]);

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex flex-1 flex-col bg-gradient-to-br from-blue-50 to-indigo-100">
        {children}
      </div>
    </div>
  );
}
