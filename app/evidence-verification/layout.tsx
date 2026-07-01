"use client";

import Image from 'next/image';
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
      <footer className="mt-auto border-t border-white/10 bg-udaan-blue text-white">
        <div className="udaan-container flex flex-col items-center justify-between gap-3 py-4 text-xs sm:flex-row sm:text-sm">
          <div className="flex flex-wrap items-center justify-center gap-2 text-white/90 sm:justify-start">
            <span>© 2026</span>
            <Image
              src="/photos/small-logo.svg"
              alt="Navadrishti logo"
              width={16}
              height={16}
              className="h-4 w-4"
            />
            <span className="font-medium">Navadrishti Evidence Verification</span>
          </div>
          <p className="text-center text-white/75 sm:text-right">
            Company milestone evidence review &amp; payment confirmation
          </p>
        </div>
      </footer>
    </div>
  );
}
