'use client';

import { usePathname } from 'next/navigation';
import { PortalAccessGate } from '@/components/portal-access-gate';

export default function GovernmentAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isPublicRoute =
    pathname === '/government-admin/login' ||
    pathname === '/government-admin/change-password';

  if (isPublicRoute) {
    return <>{children}</>;
  }

  return (
    <PortalAccessGate
      verifyUrl="/api/government-admin/verify"
      loginPath="/government-admin/login"
      sessionKey="govt_admin_tab_session"
    >
      {children}
    </PortalAccessGate>
  );
}
