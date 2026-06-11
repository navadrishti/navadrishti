"use client";

import { usePathname } from 'next/navigation';
import { PortalAccessGate } from '@/components/portal-access-gate';

export default function CompaniesCALayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublicRoute =
    pathname === '/companies/ca/login' || pathname === '/companies/ca/change-password';

  if (isPublicRoute) {
    return <>{children}</>;
  }

  return (
    <PortalAccessGate
      verifyUrl="/api/companies/ca/verify"
      loginPath="/companies/ca/login"
      sessionKey="company_ca_tab_session"
    >
      {children}
    </PortalAccessGate>
  );
}
