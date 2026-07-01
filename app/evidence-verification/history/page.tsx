'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { CAConsoleHeader, formatVerifierScopeLabels } from '@/components/ca-console-header';
import {
  EvidenceMessageCard,
  EvidencePageHeader,
  EvidencePortalMain,
  EvidencePortalShell,
  EvidenceSectionCard,
} from '@/components/evidence-verification/portal-ui';

type AuditEvent = {
  id: string;
  event_type: string;
  entity_type?: string;
  entity_id: string;
  description?: string;
  created_at: string;
  details?: Record<string, any>;
};

function prettifyLabel(value: string) {
  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function HistorySkeleton() {
  return (
    <>
      <div className="space-y-2">
        <div className="h-9 w-52 animate-pulse rounded bg-slate-200" />
        <div className="h-5 w-full max-w-2xl animate-pulse rounded bg-slate-100" />
        <div className="h-4 w-72 max-w-full animate-pulse rounded bg-slate-100" />
      </div>

      <div className="w-full rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="space-y-4 p-6 pb-4">
          <div className="space-y-2">
            <div className="h-6 w-28 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-full max-w-md animate-pulse rounded bg-slate-100" />
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="h-4 w-12 animate-pulse rounded bg-slate-100" />
              <div className="h-9 w-14 animate-pulse rounded-md bg-slate-200" />
              <div className="h-9 w-24 animate-pulse rounded-md bg-slate-100" />
              <div className="h-9 w-28 animate-pulse rounded-md bg-slate-100" />
            </div>
            <div className="h-3 w-44 animate-pulse rounded bg-slate-100" />
          </div>
        </div>

        <div className="min-h-[50vh] space-y-3 px-6 pb-6 pt-0">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-24 w-full animate-pulse rounded-md border border-slate-200 bg-slate-50"
            />
          ))}
        </div>
      </div>
    </>
  );
}

export default function EvidenceVerificationHistoryPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [context, setContext] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [projectAuditById, setProjectAuditById] = useState<Record<string, AuditEvent[]>>({});
  const [message, setMessage] = useState('');
  const [selectedEventType, setSelectedEventType] = useState<string>('ALL');
  const [filterLoading, setFilterLoading] = useState(false);
  const filterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const formatDateTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleString('en-IN', { timeZone: 'UTC' });
  };

  const dedupeEvents = (events: AuditEvent[]) => {
    const map = new Map<string, AuditEvent>();
    for (const event of events) {
      const key = `${event.id}-${event.entity_id}-${event.created_at}`;
      if (!map.has(key)) {
        map.set(key, event);
      }
    }
    return Array.from(map.values());
  };

  const fetchProjectAudit = async (projectId: string) => {
    const response = await fetch(`/api/csr-projects/${projectId}/audit`, {
      credentials: 'include',
    });

    const payload = await response.json();
    if (response.ok && payload?.success && Array.isArray(payload.data)) {
      return payload.data as AuditEvent[];
    }

    return [];
  };

  useEffect(() => {
    const loadHistory = async () => {
      setLoading(true);
      setMessage('');

      try {
        const verifyRes = await fetch('/api/evidence-verification/verify', {
          credentials: 'include',
        });

        const verifyPayload = await verifyRes.json();
        if (!verifyRes.ok || !verifyPayload?.success) {
          router.push('/evidence-verification/login');
          return;
        }

        setContext(verifyPayload.company_ca);

        const projectsRes = await fetch('/api/csr-projects', {
          credentials: 'include',
        });

        const projectsPayload = await projectsRes.json();
        if (projectsRes.ok && projectsPayload?.success && Array.isArray(projectsPayload.data)) {
          const loadedProjects = projectsPayload.data;
          setProjects(loadedProjects);

          const auditEntries = await Promise.all(
            loadedProjects.map(async (project: any) => {
              const audit = await fetchProjectAudit(project.id);
              return { projectId: project.id, audit };
            })
          );

          const auditById: Record<string, AuditEvent[]> = {};
          auditEntries.forEach(({ projectId, audit }) => {
            auditById[projectId] = audit;
          });

          setProjectAuditById(auditById);
        } else {
          setProjects([]);
          setProjectAuditById({});
          setMessage('No audit history available.');
        }
      } catch (error) {
        setMessage('Unable to load audit history.');
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    void loadHistory();
  }, [router]);

  useEffect(() => {
    return () => {
      if (filterTimerRef.current) {
        clearTimeout(filterTimerRef.current);
      }
    };
  }, []);

  const handleLogout = async () => {
    await fetch('/api/evidence-verification/logout', {
      method: 'POST',
      credentials: 'include',
    });
    router.push('/evidence-verification/login');
  };

  const allAuditEvents = useMemo(() => {
    const flatEvents = Object.values(projectAuditById).flat();
    const uniqueEvents = dedupeEvents(flatEvents);

    return uniqueEvents.sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return dateB - dateA;
    });
  }, [projectAuditById]);

  const eventTypeOptions = useMemo(() => {
    const types = Array.from(new Set(allAuditEvents.map((event) => event.event_type).filter(Boolean)));
    return types.slice(0, 8);
  }, [allAuditEvents]);

  const filteredEvents = useMemo(() => {
    if (selectedEventType === 'ALL') return allAuditEvents;
    return allAuditEvents.filter((event) => event.event_type === selectedEventType);
  }, [allAuditEvents, selectedEventType]);

  const handleFilterChange = (type: string) => {
    if (type === selectedEventType) return;

    setSelectedEventType(type);
    setFilterLoading(true);

    if (filterTimerRef.current) {
      clearTimeout(filterTimerRef.current);
    }

    filterTimerRef.current = setTimeout(() => {
      setFilterLoading(false);
    }, 350);
  };

  const scopeLabels = formatVerifierScopeLabels(context);

  return (
    <EvidencePortalShell>
      <CAConsoleHeader
        accountName={context?.user?.name}
        accountEmail={context?.user?.email}
        companyName={context?.company?.name || context?.company_name}
        caId={context?.ca_id}
        companyUserId={context?.company_user_id}
        onLogout={handleLogout}
      />

      <EvidencePortalMain>
        {loading ? (
          <HistorySkeleton />
        ) : (
          <>
        <EvidencePageHeader
          title="Audit History"
          description="Complete audit trail of CSR project events and actions."
          scopeLabels={scopeLabels || undefined}
          bordered={false}
        />

        {message ? <EvidenceMessageCard>{message}</EvidenceMessageCard> : null}

        <EvidenceSectionCard
          className="w-full"
          title="Event Log"
          description="Filter and review recorded verification activity."
          headerExtra={
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-slate-600">Filter:</span>
                <Button
                  size="sm"
                  className="h-9 min-w-[4.5rem]"
                  variant={selectedEventType === 'ALL' ? 'default' : 'outline'}
                  onClick={() => handleFilterChange('ALL')}
                >
                  All
                </Button>
                {eventTypeOptions.map((type) => (
                  <Button
                    key={type}
                    size="sm"
                    className="h-9"
                    variant={selectedEventType === type ? 'default' : 'outline'}
                    onClick={() => handleFilterChange(type)}
                  >
                    {prettifyLabel(type)}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-slate-500">
                Showing {filteredEvents.length} of {allAuditEvents.length} events
              </p>
            </div>
          }
        >
          <div className="min-h-[50vh] w-full">
          {filterLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-24 rounded-lg border border-slate-200 bg-slate-50 animate-pulse" />
              ))}
            </div>
          ) : filteredEvents.length === 0 ? (
            <p className="text-sm text-slate-600">No audit events recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {filteredEvents.map((event: AuditEvent) => (
                <div key={event.id} className="w-full rounded-md border border-slate-200 bg-white p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900">{event.event_type}</p>
                      <p className="text-sm text-slate-600">
                        {event.entity_type || 'Entity'}: {event.entity_id}
                      </p>
                      {event.description ? (
                        <p className="mt-1 text-sm text-slate-600">{event.description}</p>
                      ) : null}
                    </div>
                    <p className="shrink-0 whitespace-nowrap text-sm text-slate-600">
                      {formatDateTime(event.created_at)}
                    </p>
                  </div>
                  {event.details ? (
                    <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
                      <pre className="overflow-auto">{JSON.stringify(event.details, null, 2)}</pre>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
          </div>
        </EvidenceSectionCard>
          </>
        )}
      </EvidencePortalMain>
    </EvidencePortalShell>
  );
}
