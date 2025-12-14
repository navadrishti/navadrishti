"use client"

import { useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FileText, Download, Users, TrendingUp, Target, Calendar, BarChart3, Loader2 } from "lucide-react"

export default function ImpactReportsPage() {
  const { user } = useAuth()
  const [selectedCampaign, setSelectedCampaign] = useState("")
  const [reportType, setReportType] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)

  const campaigns = [
    { id: '1', name: 'Education for All 2024' },
    { id: '2', name: 'Healthcare Initiative' },
    { id: '3', name: 'Clean Water Project' },
  ]

  const reportTypes = [
    { value: 'quarterly', label: 'Quarterly Report' },
    { value: 'annual', label: 'Annual Report' },
    { value: 'custom', label: 'Custom Period' },
  ]

  const handleGenerateReport = () => {
    setIsGenerating(true)
    setTimeout(() => {
      setIsGenerating(false)
      // Simulate report generation
    }, 2000)
  }

  if (user?.user_type !== 'company') {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>This feature is only available for company accounts.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <>
      <Header />
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-udaan-navy mb-2">Impact Reports</h1>
          <p className="text-gray-600">Generate comprehensive CSR impact reports</p>
        </div>

      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Active Campaigns</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-udaan-orange" />
              <span className="text-3xl font-bold text-udaan-navy">12</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Total Beneficiaries</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-green-600" />
              <span className="text-3xl font-bold text-green-600">2.5K</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Impact Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-600" />
              <span className="text-3xl font-bold text-blue-600">85%</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="generate" className="space-y-6">
        <TabsList className="grid w-full md:w-[400px] grid-cols-2">
          <TabsTrigger value="generate">Generate Report</TabsTrigger>
          <TabsTrigger value="history">Report History</TabsTrigger>
        </TabsList>

        <TabsContent value="generate">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Report Generator</CardTitle>
                <CardDescription>Create detailed impact reports for your CSR initiatives</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Select Campaign</label>
                  <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a campaign" />
                    </SelectTrigger>
                    <SelectContent>
                      {campaigns.map(campaign => (
                        <SelectItem key={campaign.id} value={campaign.id}>
                          {campaign.name}
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
                      {reportTypes.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="pt-4">
                  <h3 className="font-semibold mb-3">Report Will Include:</h3>
                  <ul className="space-y-2 text-sm text-gray-600">
                    <li className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-udaan-orange" />
                      Executive Summary
                    </li>
                    <li className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-udaan-orange" />
                      Beneficiary Demographics
                    </li>
                    <li className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-udaan-orange" />
                      Impact Metrics & KPIs
                    </li>
                    <li className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-udaan-orange" />
                      Timeline & Milestones
                    </li>
                    <li className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-udaan-orange" />
                      Success Stories
                    </li>
                  </ul>
                </div>

                <Button 
                  className="w-full bg-udaan-orange hover:bg-udaan-orange/90 mt-4"
                  onClick={handleGenerateReport}
                  disabled={!selectedCampaign || !reportType || isGenerating}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating Report...
                    </>
                  ) : (
                    <>
                      <FileText className="mr-2 h-4 w-4" />
                      Generate Report
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Report Preview</CardTitle>
                <CardDescription>Sample impact metrics from your campaigns</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-4 bg-green-50 rounded-lg">
                  <h4 className="font-semibold text-green-900 mb-2">Education for All 2024</h4>
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <div>
                      <p className="text-sm text-gray-600">Students Reached</p>
                      <p className="text-2xl font-bold text-green-700">1,250</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Schools Covered</p>
                      <p className="text-2xl font-bold text-green-700">15</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-blue-50 rounded-lg">
                  <h4 className="font-semibold text-blue-900 mb-2">Healthcare Initiative</h4>
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <div>
                      <p className="text-sm text-gray-600">Beneficiaries</p>
                      <p className="text-2xl font-bold text-blue-700">850</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Health Camps</p>
                      <p className="text-2xl font-bold text-blue-700">22</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-purple-50 rounded-lg">
                  <h4 className="font-semibold text-purple-900 mb-2">Clean Water Project</h4>
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <div>
                      <p className="text-sm text-gray-600">Villages Covered</p>
                      <p className="text-2xl font-bold text-purple-700">8</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Families Benefited</p>
                      <p className="text-2xl font-bold text-purple-700">420</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Generated Reports</CardTitle>
              <CardDescription>Access your previously generated impact reports</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { name: 'Q4 2024 Annual Report', date: 'Dec 1, 2024', size: '2.4 MB' },
                  { name: 'Education Campaign - Q3 Report', date: 'Sep 30, 2024', size: '1.8 MB' },
                  { name: 'Healthcare Initiative - Mid-Year', date: 'Jun 15, 2024', size: '2.1 MB' },
                ].map((report, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <FileText className="h-8 w-8 text-udaan-orange" />
                      <div>
                        <h4 className="font-semibold">{report.name}</h4>
                        <p className="text-sm text-gray-600">{report.date} • {report.size}</p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline">
                      <Download className="h-4 w-4 mr-1" />
                      Download
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
    </>
  )
}
