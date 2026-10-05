import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { isFullyVerifiedAccount } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import type { ProjectDetailPayload } from './types';

export function useProjectDetail(projectId: string) {
  const { user, token } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<ProjectDetailPayload | null>(null);
  const [applyLoading, setApplyLoading] = useState(false);
  const allVerified = isFullyVerifiedAccount(user);

  const fetchProjectDetail = async (options?: { silent?: boolean }) => {
    if (!projectId) return;
    const silent = Boolean(options?.silent);

    try {
      if (!silent) {
        setLoading(true);
      }
      const headers: HeadersInit = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const response = await fetch(`/api/service-request-assignments?mode=project-detail&projectId=${encodeURIComponent(projectId)}`, {
        headers
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        if (!silent) {
          toast({ title: 'Error', description: data?.error || 'Failed to load project', variant: 'destructive' });
        }
        return;
      }

      setPayload(data.data);
    } catch {
      if (!silent) {
        toast({ title: 'Error', description: 'Failed to load project', variant: 'destructive' });
      }
    } finally {
      setLoading(false);
    }
  };

  const loadProjectDetail = useEffectEvent(fetchProjectDetail);

  useEffect(() => {
    if (!projectId) return;
    loadProjectDetail();
  }, [user?.id, token, projectId]);

  useEffect(() => {
    if (!token || !projectId) return;

    const interval = window.setInterval(() => {
      void loadProjectDetail({ silent: true });
    }, 20000);

    return () => window.clearInterval(interval);
  }, [user?.id, token, projectId]);

  const userId = user?.id;
  const userType = user?.user_type;
  const currentCompanyApplication = useMemo(() => {
    if (!payload || userType !== 'company') return null;
    return payload.company_applications.find((item) => Number(item.company_id) === Number(userId)) || null;
  }, [payload, userId, userType]);

  const applyForFullProject = async () => {
    if (!token || !payload) return;
    if (!allVerified) {
      toast({ title: 'Verification required', description: 'Company must be fully verified before CSR application.', variant: 'destructive' });
      return;
    }
    setApplyLoading(true);

    try {
      const response = await fetch('/api/service-request-assignments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'apply-project',
          projectId,
        })
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        toast({ title: 'Application failed', description: data?.error || 'Could not apply', variant: 'destructive' });
        return;
      }

      toast({ title: 'Application submitted', description: data?.data?.message || 'Sent to NGO for review.' });
      fetchProjectDetail();
    } catch {
      toast({ title: 'Application failed', description: 'Could not apply', variant: 'destructive' });
    } finally {
      setApplyLoading(false);
    }
  };

  return {
    user,
    allVerified,
    loading,
    payload,
    applyLoading,
    currentCompanyApplication,
    applyForFullProject,
  };
}
