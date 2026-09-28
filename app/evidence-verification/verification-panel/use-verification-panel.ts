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
    const response = await fetch(`/api/csr-projects/${projectId}/evidence`, {
      credentials: 'include',
    });

    const payload = await response.json();
    if (response.ok && payload?.success) {
      setProjectTimelineById((prev) => ({ ...prev, [projectId]: payload.data }));
      return payload.data;
    }

    return null;
  };

  const fetchCaPendingPayments = async () => {
    try {
      const res = await fetch('/api/payments/pending', { credentials: 'include' });
      const payload = await res.json();
      if (res.ok && payload?.success) {
        setCaPendingPayments([...(payload.data.attendance || []), ...(payload.data.contributions || [])]);
      }
    } catch {
      // ignore
    }
  };

  const fetchVolunteerAttendance = async () => {
    try {
      const res = await fetch('/api/evidence-verification/volunteer-attendance', {
        credentials: 'include',
      });
      const payload = await res.json();
      if (res.ok && payload?.success) {
        setVolunteerAttendance(payload.data);
      }
    } catch {
      // ignore
    }
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

      const verifyPayload = await verifyResponse.json();
      if (!verifyResponse.ok || !verifyPayload?.success) {
        router.push('/evidence-verification/login');
        return;
      }

      setContext(verifyPayload.company_ca);

      const projectsResponse = await fetch('/api/csr-projects', {
        credentials: 'include',
      });

      const projectsPayload = await projectsResponse.json();
      if (projectsResponse.ok && projectsPayload?.success) {
        const loadedProjects: CsrProjectSummary[] = Array.isArray(projectsPayload.data) ? projectsPayload.data : [];
        setProjects(loadedProjects);
        await Promise.all(loadedProjects.map((project) => fetchProjectTimeline(project.id)));
      } else {
        setProjects([]);
      }

      await fetchCaPendingPayments();
      await fetchVolunteerAttendance();
    } catch {
      router.push('/evidence-verification/login');
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
