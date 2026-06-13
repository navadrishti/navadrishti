"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type CampaignOption = {
  id: string
  title: string
}

const reportTypes = [
  { value: 'quarterly', label: 'Quarterly Report' },
  { value: 'annual', label: 'Annual Report' },
  { value: 'custom', label: 'Custom Period' },
]

export function ImpactReportsPanel() {
  const { user } = useAuth()
  const [selectedCampaign, setSelectedCampaign] = useState("")
  const [reportType, setReportType] = useState("")
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([])
  const [loadingCampaigns, setLoadingCampaigns] = useState(true)

  useEffect(() => {
    if (!user?.id) {
      setCampaigns([])
      setLoadingCampaigns(false)
      return
    }

    let cancelled = false

    const loadCampaigns = async () => {
      setLoadingCampaigns(true)
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
        const response = await fetch(`/api/campaigns?company_id=${user.id}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
        const payload = await response.json().catch(() => null)
        const rows = Array.isArray(payload?.data) ? payload.data : []

        if (!cancelled) {
          setCampaigns(
            rows.map((row: { id: string | number; title?: string | null; category?: string | null; cause?: string | null }) => ({
              id: String(row.id),
              title: String(row.title || row.category || row.cause || 'Untitled campaign').trim(),
            }))
          )
        }
      } catch {
        if (!cancelled) setCampaigns([])
      } finally {
        if (!cancelled) setLoadingCampaigns(false)
      }
    }

    void loadCampaigns()

    return () => {
      cancelled = true
    }
  }, [user?.id])

  const hasCampaigns = campaigns.length > 0

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h3 className="text-3xl font-semibold text-udaan-navy">Impact Reports</h3>
        <p className="text-gray-600">Generate comprehensive CSR impact reports</p>
      </div>

      <Tabs defaultValue="generate" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 md:w-[400px]">
          <TabsTrigger value="generate">Generate Report</TabsTrigger>
          <TabsTrigger value="history">Report History</TabsTrigger>
        </TabsList>

        <TabsContent value="generate">
          <Card>
            <CardHeader>
              <CardTitle>Report Generator</CardTitle>
              <CardDescription>Create detailed impact reports for your CSR initiatives</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Select Campaign</label>
                <Select
                  value={selectedCampaign}
                  onValueChange={setSelectedCampaign}
                  disabled={loadingCampaigns || !hasCampaigns}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={loadingCampaigns ? 'Loading campaigns...' : hasCampaigns ? 'Choose a campaign' : 'No campaigns available'} />
                  </SelectTrigger>
                  <SelectContent>
                    {campaigns.map((campaign) => (
                      <SelectItem key={campaign.id} value={campaign.id}>
                        {campaign.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Report Type</label>
                <Select value={reportType} onValueChange={setReportType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose report type" />
                  </SelectTrigger>
                  <SelectContent>
                    {reportTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {!loadingCampaigns && !hasCampaigns ? (
                <p className="text-sm text-slate-600">Publish a CSR campaign first to generate impact reports.</p>
              ) : null}

              <Button
                className="mt-2 w-full bg-udaan-orange hover:bg-udaan-orange/90"
                disabled
              >
                Generate Report
              </Button>
              <p className="text-xs text-slate-500">Report generation will be available once impact reporting is connected.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Generated Reports</CardTitle>
              <CardDescription>Access your previously generated impact reports</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600">No reports generated yet.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
