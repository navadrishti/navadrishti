'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import ProtectedRoute from '@/components/protected-route'
import { Header } from '@/components/header'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DashboardEmptyNote,
  DashboardOverviewHeader,
  DashboardSectionCard,
  DashboardStatGrid,
} from '@/components/dashboard-overview'
import { InfoMeter, InfoMeterGrid } from '@/components/info-meter'
import { useAuth } from '@/lib/auth-context'
import { isCompanyEmployeeUserClient } from '@/lib/access-control'
import {
  EMPLOYEE_MILESTONE_COMPLETED_STATUSES,
  EMPLOYEE_MILESTONE_PENDING_REVIEW_STATUSES,
  EMPLOYEE_MILESTONE_REJECTED_STATUSES,
  employeeMilestoneCompletionPercent,
} from '@/lib/company-employee-access'
import { clientAuthHeaders } from '@/lib/client-session'
import { formatStatusLabel } from '@/lib/format-date'
import { smoothNavigate } from '@/lib/utils'
import { readApiError } from '@/lib/user-facing-error'

type AssignedProject = {
  project_id: string
  title: string
  project_status: string
  ngo_name: string | null
  start_date: string | null
  end_date: string | null
  assigned_at?: string | null
  region?: string | null
  milestone_total: number
  milestone_completed: number
  pending_reviews: number
  rejected_milestones?: number
}

type ProjectDetail = {
  project: Record<string, unknown> & {
    title?: string
    ngo_name?: string | null
    project_status?: string
    description?: string | null
    start_date?: string | null
    end_date?: string | null
    region?: string | null
  }
  milestones: Array<
    Record<string, unknown> & {
      id: string
      title?: string
      status?: string
      due_date?: string | null
      description?: string | null
      reviews?: Array<Record<string, unknown>>
    }
  >
  evidence_summary: Array<Record<string, unknown>>
}

type EvidenceTimeline = {
  timeline: Array<{
    milestone: Record<string, unknown>
    evidence: Array<Record<string, unknown>>
    reviews: Array<Record<string, unknown>>
  }>
}

type EmployeeProfile = {
  user: { id: number; name: string | null; email: string | null }
  identity: { status: string; must_change_password: boolean; company_user_id: number }
  company: { id: number; name: string | null; email: string | null }
}

function formatDateLabel(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString()
}

function isActiveProjectStatus(status: string): boolean {
  const normalized = status.toLowerCase()
  return !['completed', 'closed', 'cancelled', 'canceled'].includes(normalized)
}

function isCompletedProjectStatus(status: string): boolean {
  return ['completed', 'closed'].includes(status.toLowerCase())
}

export default function EmployeeDashboardPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [profile, setProfile] = useState<EmployeeProfile | null>(null)
  const [projects, setProjects] = useState<AssignedProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ProjectDetail | null>(null)
  const [evidence, setEvidence] = useState<EvidenceTimeline | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [docMessage, setDocMessage] = useState<string | null>(null)
  const [docLoading, setDocLoading] = useState(false)

  useEffect(() => {
    if (!user) return
    if (!isCompanyEmployeeUserClient(user)) {
      smoothNavigate(router, '/individuals/dashboard', { delay: 0 })
      return
    }
    if (user.must_change_password) {
      smoothNavigate(router, '/employees/change-password', { delay: 0 })
    }
  }, [user, router])

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [meRes, projectsRes] = await Promise.all([
        fetch('/api/employee/me', { credentials: 'include', headers: clientAuthHeaders() }),
        fetch('/api/employee/projects', { credentials: 'include', headers: clientAuthHeaders() }),
      ])
      const mePayload = await meRes.json().catch(() => null)
      const projectsPayload = await projectsRes.json().catch(() => null)

      if (!meRes.ok || !mePayload?.success) {
        setProfile(null)
        setError(readApiError(mePayload, 'Failed to load employee profile'))
      } else {
        setProfile(mePayload.data as EmployeeProfile)
      }

      if (!projectsRes.ok || !projectsPayload?.success) {
        setProjects([])
        setError((prev) => prev || readApiError(projectsPayload, 'Failed to load assigned projects'))
        return
      }
      setProjects(Array.isArray(projectsPayload.data) ? projectsPayload.data : [])
    } catch {
      setError('Failed to load monitoring workspace')
      setProjects([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!user || !isCompanyEmployeeUserClient(user) || user.must_change_password) return
    void loadDashboard()
  }, [user, loadDashboard])

  const metrics = useMemo(() => {
    if (projects.length === 0) return null
    const assigned = projects.length
    const active = projects.filter((p) => isActiveProjectStatus(p.project_status)).length
    const completedProjects = projects.filter((p) => isCompletedProjectStatus(p.project_status)).length
    const milestoneTotal = projects.reduce((sum, p) => sum + (p.milestone_total || 0), 0)
    const milestoneCompleted = projects.reduce((sum, p) => sum + (p.milestone_completed || 0), 0)
    const pendingReviews = projects.reduce((sum, p) => sum + (p.pending_reviews || 0), 0)
    const rejected = projects.reduce((sum, p) => sum + (p.rejected_milestones || 0), 0)
    const completion = employeeMilestoneCompletionPercent(milestoneCompleted, milestoneTotal)
    return {
      assigned,
      active,
      completedProjects,
      milestoneTotal,
      milestoneCompleted,
      pendingReviews,
      rejected,
      completion,
    }
  }, [projects])

  const openProject = async (projectId: string) => {
    setSelectedId(projectId)
    setDetailLoading(true)
    setDocMessage(null)
    try {
      const [detailRes, evidenceRes] = await Promise.all([
        fetch(`/api/employee/projects/${encodeURIComponent(projectId)}`, {
          credentials: 'include',
          headers: clientAuthHeaders(),
        }),
        fetch(`/api/employee/projects/${encodeURIComponent(projectId)}/evidence`, {
          credentials: 'include',
          headers: clientAuthHeaders(),
        }),
      ])
      const detailPayload = await detailRes.json().catch(() => null)
      const evidencePayload = await evidenceRes.json().catch(() => null)
      if (!detailRes.ok || !detailPayload?.success) {
        setDetail(null)
        setError(readApiError(detailPayload, 'Failed to load project'))
      } else {
        setDetail(detailPayload.data as ProjectDetail)
      }
      if (evidenceRes.ok && evidencePayload?.success) {
        setEvidence(evidencePayload.data as EvidenceTimeline)
      } else {
        setEvidence(null)
      }
    } finally {
      setDetailLoading(false)
    }
  }

  const generateDocument = async (documentType: 'impact_report' | 'utilization_certificate') => {
    if (!selectedId) return
    setDocLoading(true)
    setDocMessage(null)
    try {
      const response = await fetch(
        `/api/employee/projects/${encodeURIComponent(selectedId)}/documents`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { ...clientAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ documentType, period: 'annual' }),
        }
      )
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) {
        setDocMessage(readApiError(payload, 'Failed to generate document'))
        return
      }
      const html = String(payload.html || '')
      const blob = new Blob([html], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = String(payload.filename || `${documentType}.html`)
      anchor.click()
      URL.revokeObjectURL(url)
      setDocMessage(`Downloaded ${payload.label || documentType} (project-scoped draft).`)
    } catch {
      setDocMessage('Failed to generate document')
    } finally {
      setDocLoading(false)
    }
  }

  const employeeName = profile?.user?.name || user?.name || 'Employee'
  const companyName = profile?.company?.name || 'Your company'
  const accountStatus = profile?.identity?.status
    ? formatStatusLabel(profile.identity.status)
    : null

  return (
    <ProtectedRoute userTypes={['individual']}>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 p-4 md:p-6 lg:p-8">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-gram-ink">
              Welcome, {employeeName}
            </h1>
            <p className="text-sm text-gram-muted">
              Monitoring workspace for {companyName}. This account is read-only — you can inspect
              assigned CSR projects, milestones, evidence, and project-scoped reports.
            </p>
            {accountStatus ? (
              <p className="text-xs text-slate-500">
                Account status: <span className="font-medium text-slate-700">{accountStatus}</span>
              </p>
            ) : null}
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertDescription className="flex items-center justify-between gap-3">
                <span>{error}</span>
                <Button type="button" size="sm" variant="outline" onClick={() => void loadDashboard()}>
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          {loading ? (
            <DashboardSectionCard title="Loading" description="Fetching assigned projects…">
              <p className="text-sm text-slate-500">Loading monitoring workspace…</p>
            </DashboardSectionCard>
          ) : projects.length === 0 ? (
            <DashboardSectionCard
              title="No assigned projects"
              description="Your company has not assigned any CSR projects to this monitoring account yet."
            >
              <DashboardEmptyNote>
                When assignments are added, project cards, milestone progress, and evidence timelines
                will appear here. Company administration, payments, and approvals stay with the
                company owner and Evidence Verifier.
              </DashboardEmptyNote>
            </DashboardSectionCard>
          ) : (
            <>
              <DashboardOverviewHeader
                title="Assigned CSR monitoring"
                description="Metrics use actual milestone records. Completion = approved/completed/paid milestones ÷ total milestones (shown only when totals exist)."
              />

              {metrics ? (
                <>
                  <DashboardStatGrid
                    items={[
                      {
                        label: 'Assigned projects',
                        value: metrics.assigned,
                        detail: 'Projects currently assigned to you',
                      },
                      {
                        label: 'Active projects',
                        value: metrics.active,
                        detail: 'Not completed or closed',
                      },
                      {
                        label: 'Completed projects',
                        value: metrics.completedProjects,
                        detail: 'Closed or completed status',
                      },
                      {
                        label: 'Pending review',
                        value: metrics.pendingReviews,
                        detail: 'Milestones awaiting CA review',
                        tone: metrics.pendingReviews > 0 ? 'attention' : 'default',
                      },
                    ]}
                  />

                  <InfoMeterGrid className="xl:grid-cols-3">
                    {metrics.milestoneTotal > 0 ? (
                      <InfoMeter
                        title="Milestone completion"
                        value={`${metrics.milestoneCompleted} / ${metrics.milestoneTotal}`}
                        progress={metrics.completion}
                        detail="Approved, completed, or paid ÷ total milestones"
                      />
                    ) : null}
                    <InfoMeter
                      title="Rejected needing attention"
                      value={String(metrics.rejected)}
                      detail="Milestones in rejected or revision-required status"
                    />
                    <InfoMeter
                      title="Total milestones"
                      value={String(metrics.milestoneTotal)}
                      detail="Across all assigned projects"
                    />
                  </InfoMeterGrid>
                </>
              ) : null}

              <DashboardSectionCard
                title="Assigned projects"
                description="Open a project for read-only milestone and evidence monitoring."
              >
                <div className="grid gap-3 md:grid-cols-2">
                  {projects.map((project) => {
                    const progress = employeeMilestoneCompletionPercent(
                      project.milestone_completed,
                      project.milestone_total
                    )
                    const rejected = project.rejected_milestones || 0
                    return (
                      <button
                        key={project.project_id}
                        type="button"
                        className="rounded-md border border-gram-border bg-white p-4 text-left transition hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                        onClick={() => void openProject(project.project_id)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium text-slate-900">{project.title}</p>
                          <Badge variant="outline">{formatStatusLabel(project.project_status)}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-slate-600">
                          {project.ngo_name || 'Implementing agency pending'}
                        </p>
                        <p className="mt-2 text-xs text-slate-500">
                          {formatDateLabel(project.start_date)} → {formatDateLabel(project.end_date)}
                          {project.region ? ` · ${project.region}` : ''}
                        </p>
                        {project.assigned_at ? (
                          <p className="mt-1 text-xs text-slate-500">
                            Assigned {formatDateLabel(project.assigned_at)}
                          </p>
                        ) : null}
                        {project.milestone_total > 0 ? (
                          <div className="mt-3 space-y-2">
                            <InfoMeter
                              title="Milestone progress"
                              value={`${project.milestone_completed} / ${project.milestone_total}`}
                              progress={progress}
                              detail={
                                project.pending_reviews > 0
                                  ? `${project.pending_reviews} pending review`
                                  : 'No milestones pending review'
                              }
                            />
                          </div>
                        ) : (
                          <p className="mt-3 text-sm text-slate-500">No milestones recorded yet.</p>
                        )}
                        {rejected > 0 ? (
                          <p className="mt-2 text-xs font-medium text-rose-700">
                            {rejected} milestone{rejected === 1 ? '' : 's'} need attention
                          </p>
                        ) : null}
                        <p className="mt-3 text-xs font-medium text-slate-700">Open monitoring view →</p>
                      </button>
                    )
                  })}
                </div>
              </DashboardSectionCard>
            </>
          )}

          {selectedId ? (
            <CardDetail
              detail={detail}
              evidence={evidence}
              detailLoading={detailLoading}
              docLoading={docLoading}
              docMessage={docMessage}
              onClose={() => {
                setSelectedId(null)
                setDetail(null)
                setEvidence(null)
                setDocMessage(null)
              }}
              onGenerate={generateDocument}
            />
          ) : null}
        </main>
      </div>
    </ProtectedRoute>
  )
}

function CardDetail({
  detail,
  evidence,
  detailLoading,
  docLoading,
  docMessage,
  onClose,
  onGenerate,
}: {
  detail: ProjectDetail | null
  evidence: EvidenceTimeline | null
  detailLoading: boolean
  docLoading: boolean
  docMessage: string | null
  onClose: () => void
  onGenerate: (type: 'impact_report' | 'utilization_certificate') => void
}) {
  const milestones = detail?.milestones ?? []
  const completed = milestones.filter((m) =>
    EMPLOYEE_MILESTONE_COMPLETED_STATUSES.has(String(m.status || '').toLowerCase())
  ).length
  const pending = milestones.filter((m) =>
    EMPLOYEE_MILESTONE_PENDING_REVIEW_STATUSES.has(String(m.status || '').toLowerCase())
  ).length
  const rejected = milestones.filter((m) =>
    EMPLOYEE_MILESTONE_REJECTED_STATUSES.has(String(m.status || '').toLowerCase())
  ).length
  const progress = employeeMilestoneCompletionPercent(completed, milestones.length)

  return (
    <DashboardSectionCard
      title={detail?.project?.title || 'Project monitoring'}
      description={[
        detail?.project?.ngo_name || 'Implementing agency',
        detail?.project?.project_status
          ? formatStatusLabel(String(detail.project.project_status))
          : null,
      ]
        .filter(Boolean)
        .join(' · ')}
      action={
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      }
    >
      {detailLoading || !detail ? (
        <p className="text-sm text-slate-500">Loading project…</p>
      ) : (
        <div className="space-y-6">
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-900">Project overview</h3>
            {detail.project.description ? (
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{String(detail.project.description)}</p>
            ) : (
              <p className="text-sm text-slate-500">No project description available.</p>
            )}
            <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
              <p>
                Dates: {formatDateLabel(detail.project.start_date as string | null)} →{' '}
                {formatDateLabel(detail.project.end_date as string | null)}
              </p>
              <p>Region: {detail.project.region ? String(detail.project.region) : '—'}</p>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Milestone summary</h3>
            {milestones.length === 0 ? (
              <p className="text-sm text-slate-500">No milestones recorded.</p>
            ) : (
              <>
                <InfoMeterGrid className="xl:grid-cols-3">
                  <InfoMeter
                    title="Completion"
                    value={`${completed} / ${milestones.length}`}
                    progress={progress}
                    detail="Approved, completed, or paid"
                  />
                  <InfoMeter title="Pending review" value={String(pending)} detail="Submitted for CA review" />
                  <InfoMeter
                    title="Rejected / revision"
                    value={String(rejected)}
                    detail="Requires implementing agency action"
                  />
                </InfoMeterGrid>
                <ul className="space-y-2">
                  {milestones.map((milestone) => {
                    const latest = (milestone.reviews ?? [])[0] as
                      | { decision?: string; comments?: string }
                      | undefined
                    return (
                      <li key={milestone.id} className="rounded-md border bg-slate-50 p-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium">{String(milestone.title || 'Milestone')}</p>
                          <Badge variant="outline">
                            {formatStatusLabel(String(milestone.status || ''))}
                          </Badge>
                        </div>
                        {milestone.due_date ? (
                          <p className="mt-1 text-xs text-slate-500">
                            Due {formatDateLabel(String(milestone.due_date))}
                          </p>
                        ) : null}
                        {milestone.description ? (
                          <p className="mt-1 text-xs text-slate-600">{String(milestone.description)}</p>
                        ) : null}
                        {latest ? (
                          <p className="mt-1 text-xs text-slate-600">
                            Latest review: {formatStatusLabel(String(latest.decision || 'recorded'))}
                            {latest.comments ? ` — ${String(latest.comments)}` : ''}
                          </p>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Evidence and reviews</h3>
            {!evidence?.timeline?.length ? (
              <p className="text-sm text-slate-500">No evidence submitted yet.</p>
            ) : (
              <ul className="space-y-4">
                {evidence.timeline.map((entry) => (
                  <li key={String(entry.milestone.id)} className="rounded-md border p-3">
                    <p className="text-sm font-medium text-slate-900">
                      {String(entry.milestone.title || 'Milestone')}
                    </p>
                    {entry.evidence.length === 0 ? (
                      <p className="mt-2 text-sm text-slate-500">No evidence for this milestone.</p>
                    ) : (
                      <ul className="mt-2 space-y-3">
                        {entry.evidence.map((item) => {
                          const media = Array.isArray(item.media) ? item.media : []
                          const submittedAt =
                            item.uploaded_at || item.captured_at || item.created_at
                          const submitter =
                            item.uploaded_by_name ||
                            item.submitter_name ||
                            (item.uploaded_by != null ? `User #${item.uploaded_by}` : null)
                          return (
                            <li
                              key={String(item.id)}
                              className="rounded-md border border-slate-200 bg-white p-3 text-sm"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="font-medium text-slate-800">
                                  Submission {formatDateLabel(submittedAt ? String(submittedAt) : null)}
                                </p>
                                <Badge variant="outline">
                                  {formatStatusLabel(String(item.submission_status || 'submitted'))}
                                </Badge>
                              </div>
                              {submitter ? (
                                <p className="mt-1 text-xs text-slate-500">Submitted by {String(submitter)}</p>
                              ) : null}
                              {item.description ? (
                                <p className="mt-2 text-xs text-slate-600 whitespace-pre-wrap">
                                  {String(item.description)}
                                </p>
                              ) : null}
                              {media.length > 0 ? (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {media.slice(0, 4).map((mediaItem, index) => {
                                    const row = mediaItem as Record<string, unknown>
                                    const url = String(
                                      row.public_url || row.url || row.storage_path || ''
                                    )
                                    const label = String(row.file_name || row.mime_type || `Media ${index + 1}`)
                                    return url.startsWith('http') || url.startsWith('/') ? (
                                      <a
                                        key={`${item.id}-media-${index}`}
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="rounded border px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                                      >
                                        {label}
                                      </a>
                                    ) : (
                                      <span
                                        key={`${item.id}-media-${index}`}
                                        className="rounded border px-2 py-1 text-xs text-slate-500"
                                      >
                                        {label}
                                      </span>
                                    )
                                  })}
                                </div>
                              ) : null}
                            </li>
                          )
                        })}
                      </ul>
                    )}
                    {entry.reviews[0] ? (
                      <p className="mt-3 text-xs text-slate-600">
                        CA decision:{' '}
                        {formatStatusLabel(String(entry.reviews[0].decision || 'recorded'))}
                        {entry.reviews[0].comments
                          ? ` — ${String(entry.reviews[0].comments)}`
                          : ''}
                      </p>
                    ) : (
                      <p className="mt-3 text-xs text-slate-500">No CA review recorded yet.</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-900">Project documents</h3>
            <p className="text-sm text-slate-600">
              Project-scoped drafts only. These are not approved or digitally signed statutory filings.
              Company-wide packs are unavailable.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={docLoading}
                onClick={() => onGenerate('impact_report')}
              >
                Impact report
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={docLoading}
                onClick={() => onGenerate('utilization_certificate')}
              >
                Utilization certificate
              </Button>
            </div>
            {docMessage ? <p className="text-sm text-slate-600">{docMessage}</p> : null}
          </section>
        </div>
      )}
    </DashboardSectionCard>
  )
}
