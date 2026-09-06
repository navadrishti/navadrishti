"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"
import {
  COMPANY_DOCUMENT_OPTIONS,
  NGO_DOCUMENT_OPTIONS,
  IMPACT_PERIOD_OPTIONS,
  type DocumentHistoryItem,
  type DocumentTypeId,
  type ImpactReportPeriod,
} from "@/lib/document-generation/types"
import { getCampaignLeadNgoId } from "@/lib/campaign-volunteer-attendance"
import { formatStatusLabel } from "@/lib/format-date"

type EntityOption = {
  id: string
  kind: "campaign" | "project"
  title: string
  meta?: string
}

const HISTORY_STORAGE_KEY = "gram:document-generation-history"

function downloadHtml(filename: string, html: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function readHistory(audience: "company" | "ngo"): DocumentHistoryItem[] {
  try {
    const raw = sessionStorage.getItem(`${HISTORY_STORAGE_KEY}:${audience}`)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeHistory(audience: "company" | "ngo", items: DocumentHistoryItem[]) {
  try {
    sessionStorage.setItem(`${HISTORY_STORAGE_KEY}:${audience}`, JSON.stringify(items.slice(0, 20)))
  } catch {
    // ignore storage failures
  }
}

type ImpactReportsPanelProps = {
  audience?: "company" | "ngo"
}

export function ImpactReportsPanel({ audience }: ImpactReportsPanelProps) {
  const { user, token } = useAuth()
  const resolvedAudience = audience || (user?.user_type === "ngo" ? "ngo" : "company")

  const documentOptions =
    resolvedAudience === "ngo" ? NGO_DOCUMENT_OPTIONS : COMPANY_DOCUMENT_OPTIONS

  const [documentType, setDocumentType] = useState<DocumentTypeId>("impact_report")
  const [period, setPeriod] = useState<ImpactReportPeriod>("annual")
  const [periodStart, setPeriodStart] = useState("")
  const [periodEnd, setPeriodEnd] = useState("")
  const [selectedEntity, setSelectedEntity] = useState("")
  const [entities, setEntities] = useState<EntityOption[]>([])
  const [loadingEntities, setLoadingEntities] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [history, setHistory] = useState<DocumentHistoryItem[]>([])

  useEffect(() => {
    setHistory(readHistory(resolvedAudience))
  }, [resolvedAudience])

  const selectedOption = useMemo(
    () => documentOptions.find((item) => item.value === documentType) || documentOptions[0],
    [documentOptions, documentType]
  )

  const needsEntity = Boolean(selectedOption?.needsEntity)
  const needsPeriod =
    documentType === "impact_report" || documentType === "implementing_agency_report"

  const loadEntities = useCallback(async () => {
    if (!user?.id) {
      setEntities([])
      setLoadingEntities(false)
      return
    }

    setLoadingEntities(true)
    try {
      const authHeaders = token ? { Authorization: `Bearer ${token}` } : undefined

      if (resolvedAudience === "company") {
        const response = await fetch(`/api/campaigns?company_id=${user.id}`, {
          headers: authHeaders,
        })
        const payload = await response.json().catch(() => null)
        const rows = Array.isArray(payload?.data) ? payload.data : []
        setEntities(
          rows.map((row: any) => ({
            id: `campaign:${String(row.id)}`,
            kind: "campaign" as const,
            title: String(row.title || row.category || "Untitled campaign").trim(),
            meta: row.status ? formatStatusLabel(String(row.status)) : undefined,
          }))
        )
        return
      }

      const [projectsResponse, campaignsResponse] = await Promise.all([
        fetch("/api/csr-projects", { headers: authHeaders, credentials: "include" }),
        fetch("/api/campaigns", { headers: authHeaders }),
      ])

      const projectsPayload = await projectsResponse.json().catch(() => null)
      const campaignsPayload = await campaignsResponse.json().catch(() => null)

      const projects = Array.isArray(projectsPayload?.data) ? projectsPayload.data : []
      const campaigns = Array.isArray(campaignsPayload?.data) ? campaignsPayload.data : []

      const projectOptions: EntityOption[] = projects.map((row: any) => ({
        id: `project:${String(row.id)}`,
        kind: "project",
        title: String(row.title || row.campaigns?.title || "Untitled project").trim(),
        meta: row.project_status
          ? `Project · ${formatStatusLabel(String(row.project_status))}`
          : "Project",
      }))

      const leadCampaignOptions: EntityOption[] = campaigns
        .filter((row: any) => getCampaignLeadNgoId(row.impact_metrics) === user.id)
        .map((row: any) => ({
          id: `campaign:${String(row.id)}`,
          kind: "campaign" as const,
          title: String(row.title || row.category || "Untitled campaign").trim(),
          meta: row.status
            ? `Lead campaign · ${formatStatusLabel(String(row.status))}`
            : "Lead campaign",
        }))

      const seen = new Set(projectOptions.map((item) => item.id))
      setEntities([
        ...projectOptions,
        ...leadCampaignOptions.filter((item) => !seen.has(item.id)),
      ])
    } catch {
      setEntities([])
    } finally {
      setLoadingEntities(false)
    }
  }, [resolvedAudience, token, user?.id])

  useEffect(() => {
    void loadEntities()
  }, [loadEntities])

  useEffect(() => {
    if (!documentOptions.some((item) => item.value === documentType)) {
      setDocumentType(documentOptions[0].value)
    }
  }, [documentOptions, documentType])

  const canGenerate = useMemo(() => {
    if (generating || !user?.id) return false
    if (needsEntity && !selectedEntity) return false
    if (needsPeriod && period === "custom" && (!periodStart || !periodEnd)) return false
    return true
  }, [generating, needsEntity, needsPeriod, period, periodEnd, periodStart, selectedEntity, user?.id])

  const handleGenerate = async () => {
    if (!canGenerate || !token) {
      toast.error("Sign in again to generate documents")
      return
    }

    setGenerating(true)
    try {
      const [kind, entityId] = needsEntity && selectedEntity.includes(":")
        ? (selectedEntity.split(":") as ["campaign" | "project", string])
        : needsEntity
          ? (["campaign", selectedEntity] as const)
          : ([null, null] as const)

      const response = await fetch("/api/documents/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify({
          documentType,
          campaignId: kind === "campaign" ? entityId || null : null,
          projectId: kind === "project" ? entityId || null : null,
          period: needsPeriod ? period : null,
          periodStart: needsPeriod && period === "custom" ? periodStart : null,
          periodEnd: needsPeriod && period === "custom" ? periodEnd : null,
        }),
      })

      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success || !payload?.html) {
        throw new Error(payload?.error || "Failed to generate document")
      }

      downloadHtml(String(payload.filename || "gram-document.html"), String(payload.html))

      const historyItem: DocumentHistoryItem = {
        id: `${Date.now()}`,
        documentType,
        filename: String(payload.filename || "gram-document.html"),
        label: String(payload.label || selectedOption?.label || "Document"),
        createdAt: new Date().toISOString(),
        entityTitle: payload.entityTitle ? String(payload.entityTitle) : undefined,
      }
      const nextHistory = [historyItem, ...history].slice(0, 20)
      setHistory(nextHistory)
      writeHistory(resolvedAudience, nextHistory)

      toast.success("Document downloaded. Open the HTML file and use Print → Save as PDF if needed.")
    } catch (error: any) {
      toast.error(error?.message || "Failed to generate document")
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h3 className="text-3xl font-semibold text-udaan-navy">Impact Reports</h3>
        <p className="text-gray-600">
          {resolvedAudience === "ngo"
            ? "Generate impact reports, implementing-agency packs, utilization certificates, and compliance status from GRAM records"
            : "Generate CSR impact reports, compliance profile, policy, Board Annexure II drafts, and utilization certificates"}
        </p>
      </div>

      <Tabs defaultValue="generate" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 md:w-[400px]">
          <TabsTrigger value="generate">Generate Report</TabsTrigger>
          <TabsTrigger value="history">Report History</TabsTrigger>
        </TabsList>

        <TabsContent value="generate">
          <Card>
            <CardHeader>
              <CardTitle>Document Generator</CardTitle>
              <CardDescription>
                Downloads an HTML document from live platform data. Print to PDF from your browser.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Document Type</label>
                <Select
                  value={documentType}
                  onValueChange={(value) => setDocumentType(value as DocumentTypeId)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose document type" />
                  </SelectTrigger>
                  <SelectContent>
                    {documentOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {needsEntity ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {resolvedAudience === "ngo" ? "Select Project or Lead Campaign" : "Select Campaign"}
                  </label>
                  <Select
                    value={selectedEntity}
                    onValueChange={setSelectedEntity}
                    disabled={loadingEntities || entities.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          loadingEntities
                            ? "Loading..."
                            : entities.length
                              ? "Choose an initiative"
                              : "No initiatives available"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {entities.map((entity) => (
                        <SelectItem key={entity.id} value={entity.id}>
                          {entity.title}
                          {entity.meta ? ` (${entity.meta})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              {needsPeriod ? (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Reporting Period</label>
                    <Select
                      value={period}
                      onValueChange={(value) => setPeriod(value as ImpactReportPeriod)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose period" />
                      </SelectTrigger>
                      <SelectContent>
                        {IMPACT_PERIOD_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {period === "custom" ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Period Start</label>
                        <Input
                          type="date"
                          value={periodStart}
                          onChange={(event) => setPeriodStart(event.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Period End</label>
                        <Input
                          type="date"
                          value={periodEnd}
                          onChange={(event) => setPeriodEnd(event.target.value)}
                        />
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}

              {!loadingEntities && needsEntity && entities.length === 0 ? (
                <p className="text-sm text-slate-600">
                  {resolvedAudience === "ngo"
                    ? "Join a CSR project or accept a lead campaign invitation before generating reports."
                    : "Publish a CSR campaign first to generate campaign-linked documents."}
                </p>
              ) : null}

              <Button
                className="mt-2 w-full bg-udaan-orange hover:bg-udaan-orange/90"
                disabled={!canGenerate}
                onClick={() => void handleGenerate()}
              >
                {generating ? "Generating..." : "Generate & Download HTML"}
              </Button>
              <p className="text-xs text-slate-500">
                Documents include a GRAM disclaimer and are not MCA filings or statutory certificates.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Generated Reports</CardTitle>
              <CardDescription>
                Downloads from this browser session only (not stored on the server yet)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-sm text-slate-600">No reports generated yet in this session.</p>
              ) : (
                <div className="space-y-3">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col gap-1 rounded-lg border border-slate-200 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-900">{item.label}</p>
                        <p className="text-xs text-slate-500">
                          {item.entityTitle ? `${item.entityTitle} · ` : ""}
                          {item.filename}
                        </p>
                      </div>
                      <p className="text-xs text-slate-500">
                        {new Date(item.createdAt).toLocaleString("en-IN")}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
