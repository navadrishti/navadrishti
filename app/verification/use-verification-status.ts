import { useEffect, useState } from 'react';
import type { AuthSnapshot } from './types';

export function useVerificationStatus(enabled: boolean, emailOtpVerified: boolean, userType?: string) {
  const [authSnapshot, setAuthSnapshot] = useState<AuthSnapshot | null>(null);
  const [reverificationPending, setReverificationPending] = useState(false);

  useEffect(() => {
    const fetchAuthSnapshot = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;

        const response = await fetch('/api/auth/me', {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (!response.ok) return;
        const data = await response.json();
        setAuthSnapshot({
          email_verified: data?.user?.email_verified,
          phone_verified: data?.user?.phone_verified,
          verification_status: data?.user?.verification_status
        });
      } catch {
        // keep existing values from auth context on failure
      }
    };

    const fetchVerificationStatus = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token || !userType) return;

        const response = await fetch(`/api/verification/${userType}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!response.ok) return;

        const data = await response.json();
        const pending = Boolean(data?.reverification_pending);
        setReverificationPending(pending);
        setAuthSnapshot((prev) => ({
          ...(prev || {}),
          verification_status: data?.verification_status || data?.status || prev?.verification_status,
          reverification_pending: pending
        }));
      } catch {
        // ignore
      }
    };

    if (enabled) {
      fetchAuthSnapshot();
      fetchVerificationStatus();
    }
  }, [enabled, emailOtpVerified, userType]);

  return { authSnapshot, setAuthSnapshot, reverificationPending, setReverificationPending };
}
