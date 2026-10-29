import { readApiError } from '@/lib/user-facing-error'
import { clientAuthFetchInit } from '@/lib/client-session';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { isFullyVerifiedAccount } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { keepOwnApplication, mergeOwnApplication, readReturnedApplication } from './helpers';
import type { CompanyApplication, ProjectDetailPayload } from './types';

export function useProjectDetail(projectId: string) {
  const { user, token } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<ProjectDetailPayload | null>(null);
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const stickyApplicationRef = useRef<CompanyApplication | null>(null);
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

      setPayload((current) =>
        keepOwnApplication(current, data.data, userId, userType, stickyApplicationRef.current)
      );
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

  const rememberApplication = (application: CompanyApplication) => {
    stickyApplicationRef.current = application
    setApplyError(null)
    setPayload((current) => (current ? mergeOwnApplication(current, application) : current))
  }

  const applyForFullProject = async () => {
    if (!payload) return;
    if (!allVerified) {
      const description = 'Company must be fully verified before CSR application.'
      setApplyError(description)
      toast({ title: 'Verification required', description, variant: 'destructive' });
      return;
    }
    setApplyLoading(true);
    setApplyError(null)

    try {
      const response = await fetch('/api/service-request-assignments', clientAuthFetchInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'apply-project',
          projectId,
        }),
      }));

      const data = await response.json().catch(() => null);
      const returned = readReturnedApplication(data?.data || data, userId)
        || (userId ? { company_id: Number(userId), status: 'pending', needs: [] } : null)

      if (response.status === 409 && /already applied/i.test(String(data?.error || ''))) {
        if (returned) rememberApplication(returned)
        toast({
          title: 'Already applied',
          description: readApiError(data, 'Your existing takeover application is shown below.'),
        });
        await fetchProjectDetail({ silent: true });
        return;
      }

      if (!response.ok || !data?.success) {
        const description = readApiError(data, 'Could not apply')
        setApplyError(description)
        toast({ title: 'Application failed', description, variant: 'destructive' });
        return;
      }

      if (returned) rememberApplication(returned)
      toast({ title: 'Application submitted', description: data?.data?.message || 'Sent to NGO for review.' });
      await fetchProjectDetail({ silent: true });
    } catch {
      const description = 'Could not apply'
      setApplyError(description)
      toast({ title: 'Application failed', description, variant: 'destructive' });
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
    applyError,
    currentCompanyApplication,
    applyForFullProject,
  };
}
