'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CAConsoleHeader } from '@/components/ca-console-header';
import {
  mockCompanyCAContext,
  mockProjectsResponse,
  mockAuditHistoryResponse
} from '@/lib/mock-ca-data';

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
    <div className="min-h-screen bg-slate-100">
      <div className="border-b bg-white">
        <div className="mx-auto max-w-6xl px-6 py-5">
          <div className="h-8 w-56 rounded bg-slate-200 animate-pulse" />
          <div className="mt-2 h-4 w-80 rounded bg-slate-100 animate-pulse" />
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 pt-6 pb-10 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-4 w-24 rounded bg-slate-200 animate-pulse" />
            <div className="h-7 w-24 rounded-full bg-slate-200 animate-pulse" />
          </div>
          <div className="h-4 w-40 rounded bg-slate-100 animate-pulse" />
        </div>

        <div className="rounded-lg border bg-white p-4">
          <div className="h-4 w-1/2 rounded bg-slate-200 animate-pulse" />
        </div>

        <div className="h-10 w-40 rounded bg-slate-200 animate-pulse" />

        <div className="rounded-xl border bg-white p-6 space-y-4">
          <div className="h-5 w-44 rounded bg-slate-200 animate-pulse" />
          <div className="h-4 w-80 rounded bg-slate-100 animate-pulse" />

          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-md border bg-slate-50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <div className="h-4 w-40 rounded bg-slate-200 animate-pulse" />
                    <div className="h-3 w-28 rounded bg-slate-100 animate-pulse" />
                  </div>
                  <div className="h-6 w-28 rounded-full bg-slate-200 animate-pulse" />
                </div>

                <div className="grid gap-2 md:grid-cols-3">
                  <div className="h-3 rounded bg-slate-100 animate-pulse" />
                  <div className="h-3 rounded bg-slate-100 animate-pulse" />
                  <div className="h-3 rounded bg-slate-100 animate-pulse" />
                </div>

                <div className="h-16 rounded border bg-white animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CompanyCAHistoryPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [context, setContext] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [projectAuditById, setProjectAuditById] = useState<Record<string, AuditEvent[]>>({});
  const [message, setMessage] = useState('');
  const [useMockData, setUseMockData] = useState(false);

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
      credentials: 'include'
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
        if (useMockData) {
          setContext(mockCompanyCAContext);

          const loadedProjects = Array.isArray(mockProjectsResponse.data)
            ? mockProjectsResponse.data
            : [];
          setProjects(loadedProjects);

          const auditById: Record<string, AuditEvent[]> = {};

          loadedProjects.forEach((project: any) => {
            if (project.id === 'proj-001') {
              auditById[project.id] = Array.isArray(mockAuditHistoryResponse.data)
                ? (mockAuditHistoryResponse.data as AuditEvent[])
                : [];
            } else {
              auditById[project.id] = [];
            }
          });

          setProjectAuditById(auditById);
        } else {
          const verifyRes = await fetch('/api/companies/ca/verify', {
            credentials: 'include'
          });

          const verifyPayload = await verifyRes.json();
          if (!verifyRes.ok || !verifyPayload?.success) {
            router.push('/companies/ca/login');
            return;
          }

          setContext(verifyPayload.company_ca);

          const projectsRes = await fetch('/api/csr-projects', {
            credentials: 'include'
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
        }
      } catch (error) {
        if (!useMockData) {
          setMessage('Unable to load audit history.');
          console.error(error);
        }
      } finally {
        setLoading(false);
      }
    };

    loadHistory();
  }, [router, useMockData]);

  useEffect(() => {
    return () => {
      if (filterTimerRef.current) {
        clearTimeout(filterTimerRef.current);
      }
    };
  }, []);

  const handleLogout = async () => {
    await fetch('/api/companies/ca/logout', {
      method: 'POST',
      credentials: 'include'
    });
    router.push('/companies/ca/login');
  };

  const handleChangePassword = () => {
    router.push('/companies/ca/settings');
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
    const types = Array.from(
      new Set(allAuditEvents.map((event) => event.event_type).filter(Boolean))
    );

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

  if (loading) {
    return <HistorySkeleton />;
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <CAConsoleHeader
        title="Audit History"
        subtitle={`Company ID: ${context?.company_user_id || 'Loading...'}`}
        accountName={context?.company?.name || context?.company_name || context?.user?.name}
        accountEmail={context?.user?.email || 'testing@example.com'}
        userId={context?.company_user_id}
        onLogout={handleLogout}
        onChangePassword={handleChangePassword}
      />

      <div className="mx-auto max-w-6xl px-6 pt-6 pb-10 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">Use Mock Data:</label>
            <button
              onClick={() => setUseMockData(!useMockData)}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${
                useMockData
                  ? 'bg-blue-100 text-blue-700 border border-blue-300'
                  : 'bg-gray-100 text-gray-600 border border-gray-300'
              }`}
            >
              {useMockData ? 'ON (Mock)' : 'OFF (API)'}
            </button>
          </div>

          <div className="text-xs text-slate-500">
            {useMockData ? 'Using sample data for testing' : 'Using live API data'}
          </div>
        </div>

        {message ? (
          <Card>
            <CardContent className="pt-4 text-sm text-slate-700">{message}</CardContent>
          </Card>
        ) : null}

        <Button variant="outline" onClick={() => router.push('/companies/ca')}>
          ← Back to Dashboard
        </Button>

        <Card>
          <CardHeader className="space-y-4">
            <div>
              <CardTitle>Audit History</CardTitle>
              <CardDescription>
                Complete audit trail of all CSR project events and actions
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-600">Filter:</span>

              <Button
                size="sm"
                variant={selectedEventType === 'ALL' ? 'default' : 'outline'}
                onClick={() => handleFilterChange('ALL')}
              >
                All
              </Button>

              {eventTypeOptions.map((type) => (
                <Button
                  key={type}
                  size="sm"
                  variant={selectedEventType === type ? 'default' : 'outline'}
                  onClick={() => handleFilterChange(type)}
                >
                  {prettifyLabel(type)}
                </Button>
              ))}
            </div>

            <div className="text-xs text-slate-500">
              Showing {filteredEvents.length} of {allAuditEvents.length} events
            </div>
          </CardHeader>

          <CardContent>
            {filterLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="rounded-md border bg-slate-50 p-4 space-y-3 animate-pulse">
                    <div className="flex items-center justify-between">
                      <div className="space-y-2">
                        <div className="h-4 w-40 rounded bg-slate-200" />
                        <div className="h-3 w-28 rounded bg-slate-100" />
                      </div>
                      <div className="h-6 w-28 rounded-full bg-slate-200" />
                    </div>

                    <div className="grid gap-2 md:grid-cols-3">
                      <div className="h-3 rounded bg-slate-100" />
                      <div className="h-3 rounded bg-slate-100" />
                      <div className="h-3 rounded bg-slate-100" />
                    </div>

                    <div className="h-16 rounded border bg-white" />
                  </div>
                ))}
              </div>
            ) : filteredEvents.length === 0 ? (
              <p className="text-sm text-slate-600">No audit events recorded yet.</p>
            ) : (
              <div className="space-y-3">
                {filteredEvents.map((event: AuditEvent) => (
                  <div key={event.id} className="rounded-md border bg-slate-50 p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">{event.event_type}</p>
                        <p className="text-sm text-slate-600">
                          {event.entity_type || 'Entity'}: {event.entity_id}
                        </p>
                        {event.description && (
                          <p className="mt-1 text-sm text-slate-600">{event.description}</p>
                        )}
                      </div>
                      <p className="whitespace-nowrap text-sm text-slate-600">
                        {formatDateTime(event.created_at)}
                      </p>
                    </div>

                    {event.details && (
                      <div className="mt-2 rounded border bg-white p-2 text-xs text-slate-600">
                        <pre className="overflow-auto">
                          {JSON.stringify(event.details, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}