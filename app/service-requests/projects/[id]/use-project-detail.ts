import { readApiError } from '@/lib/user-facing-error'
import { getClientSessionToken } from '@/lib/client-session';
import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { isFullyVerifiedAccount } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import type { CompanyApplication, ProjectDetailPayload } from './types';

function sessionToken(authToken: string | null) {
  return getClientSessionToken() || authToken;
}

function mergeOwnApplication(payload: ProjectDetailPayload, application: CompanyApplication): ProjectDetailPayload {
  const others = (payload.company_applications || []).filter(
    (item) => Number(item.company_id) !== Number(application.company_id)
  )
  return { ...payload, company_applications: [...others, application] }
}

function readReturnedApplication(payload: unknown, companyId: number | undefined): CompanyApplication | null {
  if (!payload || typeof payload !== 'object' || !companyId) return null
  const raw = (payload as { application?: unknown }).application
  if (!raw || typeof raw !== 'object') return null
  const row = raw as { company_id?: unknown; status?: unknown; needs?: unknown }
  return {
    company_id: Number(row.company_id || companyId),
    status: String(row.status || 'pending'),
    needs: Array.isArray(row.needs) ? (row.needs as CompanyApplication['needs']) : [],
  }
}

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
    const authToken = sessionToken(token);

    try {
      if (!silent) {
        setLoading(true);
      }
      const headers: HeadersInit = {};
      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`;
      }
      const response = await fetch(`/api/service-request-assignments?mode=project-detail&projectId=${encodeURIComponent(projectId)}`, {
        credentials: 'include',
        headers
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        if (!silent) {
          toast({ title: 'Error', description: readApiError(data, 'Failed to load project'), variant: 'destructive' });
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
    if (!sessionToken(token) || !projectId) return;

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
    if (!payload) return;
    if (!allVerified) {
      toast({ title: 'Verification required', description: 'Company must be fully verified before CSR application.', variant: 'destructive' });
      return;
    }
    const authToken = sessionToken(token);
    setApplyLoading(true);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`
      }
      const response = await fetch('/api/service-request-assignments', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          action: 'apply-project',
          projectId,
        })
      });

      const data = await response.json();
      const returned = readReturnedApplication(data?.data || data, userId)
      if (returned) {
        setPayload((current) => (current ? mergeOwnApplication(current, returned) : current))
      }

      if (response.status === 409 && /already applied/i.test(String(data?.error || ''))) {
        toast({
          title: 'Already applied',
          description: readApiError(data, 'Your existing takeover application is shown below.'),
        });
        await fetchProjectDetail({ silent: true });
        return;
      }

      if (!response.ok || !data?.success) {
        toast({ title: 'Application failed', description: readApiError(data, 'Could not apply'), variant: 'destructive' });
        return;
      }

      toast({ title: 'Application submitted', description: data?.data?.message || 'Sent to NGO for review.' });
      await fetchProjectDetail({ silent: true });
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
