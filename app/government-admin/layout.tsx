'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function GovernmentAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const isPublicRoute =
    pathname === '/government-admin/login' ||
    pathname === '/government-admin/change-password';

  useEffect(() => {
    if (isPublicRoute) return;

    let cancelled = false;

    const checkAccess = async () => {
      try {
        const hasTab =
          typeof window !== 'undefined' &&
          Boolean(sessionStorage.getItem('govt_admin_tab_session'));

        if (!hasTab) {
          if (!cancelled) router.replace('/government-admin/login');
          return;
        }

        const response = await fetch('/api/government-admin/verify', {
          method: 'GET',
          credentials: 'include',
        });

        if (!response.ok) {
          if (!cancelled) router.replace('/government-admin/login');
          return;
        }

        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) router.replace('/government-admin/login');
      }
    };

    checkAccess();

    return () => {
      cancelled = true;
    };
  }, [isPublicRoute, router]);

  if (isPublicRoute) {
    return <>{children}</>;
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-blue-50">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600" />
          <p className="mt-4 text-blue-600">Checking authentication...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
