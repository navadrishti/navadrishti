import { readApiError } from '@/lib/user-facing-error'
import { clientAuthFetchInit } from '@/lib/client-session';
import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { isFullyVerifiedAccount } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import type { CompanyApplication, ProjectDetailPayload } from './types';

function mergeOwnApplication(payload: ProjectDetailPayload, application: CompanyApplication): ProjectDetailPayload {
  const others = (payload.company_applications || []).filter(
    (item) => Number(item.company_id) !== Number(application.company_id)
  )
  const project = payload.project
    ? {
        ...payload.project,
        pending_company_applications: [
          ...(payload.project.pending_company_applications || []).filter(
            (item) => Number(item.company_id) !== Number(application.company_id)
          ),
          { company_id: application.company_id, status: application.status },
        ],
      }
    : payload.project
  return { ...payload, project, company_applications: [...others, application] }
}

function keepOwnApplication(
  previous: ProjectDetailPayload | null,
  next: ProjectDetailPayload,
  companyId: number | undefined,
  userType: string | undefined,
): ProjectDetailPayload {
  if (!previous || userType !== 'company' || !companyId) return next
  const mine = previous.company_applications.find((item) => Number(item.company_id) === Number(companyId))
  const incoming = next.company_applications.find((item) => Number(item.company_id) === Number(companyId))
  if (mine && !incoming) return mergeOwnApplication(next, mine)
  return next
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
  const userId = user?.id;
  const userType = user?.user_type;

  const fetchProjectDetail = async (options?: { silent?: boolean }) => {
    if (!projectId) return;
    const silent = Boolean(options?.silent);

    try {
      if (!silent) {
        setLoading(true);
      }
      const response = await fetch(
        `/api/service-request-assignments?mode=project-detail&projectId=${encodeURIComponent(projectId)}`,
        clientAuthFetchInit({ cache: 'no-store' })
      );

      const data = await response.json();
      if (!response.ok || !data?.success) {
        if (!silent) {
          toast({ title: 'Error', description: readApiError(data, 'Failed to load project'), variant: 'destructive' });
        }
        return;
      }

      setPayload((current) => keepOwnApplication(current, data.data, userId, userType));
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
    if (!projectId) return;

    const interval = window.setInterval(() => {
      void loadProjectDetail({ silent: true });
    }, 20000);

    return () => window.clearInterval(interval);
  }, [user?.id, token, projectId]);

  const currentCompanyApplication = useMemo(() => {
    if (!payload || userType !== 'company' || !userId) return null;
    const fromList = payload.company_applications.find((item) => Number(item.company_id) === Number(userId));
    if (fromList) return fromList;
    const metaApps = payload.project?.pending_company_applications;
    const fromMeta = Array.isArray(metaApps)
      ? metaApps.find((item) => Number(item.company_id) === Number(userId))
      : null;
    if (!fromMeta) return null;
    return {
      company_id: Number(fromMeta.company_id),
      status: String(fromMeta.status || 'pending'),
      needs: [],
    };
  }, [payload, userId, userType]);

  const applyForFullProject = async () => {
    if (!payload) return;
    if (!allVerified) {
      toast({ title: 'Verification required', description: 'Company must be fully verified before CSR application.', variant: 'destructive' });
      return;
    }
    setApplyLoading(true);

    try {
      const response = await fetch('/api/service-request-assignments', clientAuthFetchInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'apply-project',
          projectId,
        }),
      }));

      const data = await response.json();
      const returned = readReturnedApplication(data?.data || data, userId)
        || (userId ? { company_id: Number(userId), status: 'pending', needs: [] } : null)

      if (response.status === 409 && /already applied/i.test(String(data?.error || ''))) {
        if (returned) {
          setPayload((current) => (current ? mergeOwnApplication(current, returned) : current))
        }
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

      if (returned) {
        setPayload((current) => (current ? mergeOwnApplication(current, returned) : current))
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
