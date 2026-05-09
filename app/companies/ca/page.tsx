'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import CompanyCAPanelClient from './company-ca-panel-client';
import CompanyCAPanelSkeleton from '@/components/company-ca/skeletons/CompanyCAPanelSkeleton';

export default function CompanyCAPanelPage() {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const verifyAccess = async () => {
      try {
        const response = await fetch('/api/companies/ca/verify', {
          credentials: 'include',
        });

        if (!response.ok) {
          if (!cancelled) {
            router.replace('/companies/ca/login');
          }
          return;
        }

        try {
          const hasTab = typeof window !== 'undefined' && sessionStorage.getItem('company_ca_tab_session');
          if (!hasTab) {
            if (!cancelled) {
              router.replace('/companies/ca/login');
            }
            return;
          }
        } catch {
          // Ignore storage access issues and continue with the authenticated session.
        }

        if (!cancelled) {
          setIsAuthorized(true);
        }
      } catch {
        if (!cancelled) {
          router.replace('/companies/ca/login');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    verifyAccess();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (isLoading) {
    return <CompanyCAPanelSkeleton />;
  }

  if (!isAuthorized) {
    return <CompanyCAPanelSkeleton />;
  }

  return <CompanyCAPanelClient />;
}