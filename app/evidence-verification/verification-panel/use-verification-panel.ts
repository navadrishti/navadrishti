import { useEffect, useEffectEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CompanyCAContext } from '../types';
import type {
  CsrProjectSummary,
  PendingPaymentItem,
  ProjectTimeline,
  VolunteerAttendanceData,
} from './types';

export function useVerificationPanel() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [context, setContext] = useState<CompanyCAContext | null>(null);
  const [projects, setProjects] = useState<CsrProjectSummary[]>([]);
  const [projectTimelineById, setProjectTimelineById] = useState<Record<string, ProjectTimeline>>({});
  const [panelMessage, setPanelMessage] = useState<string>('');
  const [caPendingPayments, setCaPendingPayments] = useState<PendingPaymentItem[]>([]);
  const [volunteerAttendance, setVolunteerAttendance] = useState<VolunteerAttendanceData | null>(null);

  const fetchProjectTimeline = async (projectId: string): Promise<ProjectTimeline | null> => {
    try {
      const response = await fetch(`/api/csr-projects/${projectId}/evidence`, {
        credentials: 'include',
      });
      const payload = await response.json();
      if (response.ok && payload?.success) {
        setProjectTimelineById((prev) => ({ ...prev, [projectId]: payload.data }));
        return payload.data;
      }
    } catch {
      // Reported by the caller as a partial load.
    }
    return null;
  };

  const fetchCaPendingPayments = async () => {
    try {
      const res = await fetch('/api/payments/pending', { credentials: 'include' });
      const payload = await res.json();
      if (res.ok && payload?.success) {
        setCaPendingPayments([...(payload.data.attendance || []), ...(payload.data.contributions || [])]);
        return true;
      }
    } catch {
      // Reported by the caller as a partial load.
    }
    return false;
  };

  const fetchVolunteerAttendance = async () => {
    try {
      const res = await fetch('/api/evidence-verification/volunteer-attendance', {
        credentials: 'include',
      });
      const payload = await res.json();
      if (res.ok && payload?.success) {
        setVolunteerAttendance(payload.data);
        return true;
      }
    } catch {
      // Reported by the caller as a partial load.
    }
    return false;
  };

  const loadPanel = async ({ background = false }: { background?: boolean } = {}) => {
    if (!background) {
      setLoading(true);
      setPanelMessage('');
    }

    try {
      const verifyResponse = await fetch('/api/evidence-verification/verify', {
        credentials: 'include',
      });

      const verifyPayload = await verifyResponse.json().catch(() => null);
      if (verifyResponse.status === 401 || verifyResponse.status === 403 || (verifyResponse.ok && !verifyPayload?.success)) {
        router.push('/evidence-verification/login');
        return;
      }
      if (!verifyResponse.ok) {
        setPanelMessage('The verification console could not be loaded. Please refresh to try again.');
        return;
      }

      setContext(verifyPayload.company_ca);

      const failed: string[] = [];
      const projectsResponse = await fetch('/api/csr-projects', {
        credentials: 'include',
      });

      const projectsPayload = await projectsResponse.json().catch(() => null);
      if (projectsResponse.ok && projectsPayload?.success) {
        const loadedProjects: CsrProjectSummary[] = Array.isArray(projectsPayload.data) ? projectsPayload.data : [];
        setProjects(loadedProjects);
        const timelines = await Promise.all(loadedProjects.map((project) => fetchProjectTimeline(project.id)));
        if (timelines.some((timeline) => timeline === null)) failed.push('some project timelines');
      } else {
        failed.push('projects');
      }

      if (!(await fetchCaPendingPayments())) failed.push('pending payments');
      if (!(await fetchVolunteerAttendance())) failed.push('volunteer attendance');

      if (failed.length > 0) {
        setPanelMessage(`Could not load ${failed.join(', ')}. Refresh to try again.`);
      }
    } catch {
      setPanelMessage('The verification console could not be loaded. Check your connection and refresh.');
    } finally {
      setLoading(false);
    }
  };

  const loadPanelOnMount = useEffectEvent(() => loadPanel());

  useEffect(() => {
    void loadPanelOnMount();
  }, []);

  return {
    loading,
    context,
    projects,
    projectTimelineById,
    caPendingPayments,
    volunteerAttendance,
    panelMessage,
    setPanelMessage,
    refreshPanel: () => loadPanel({ background: true }),
  };
}
