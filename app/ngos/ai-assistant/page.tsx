"use client"

import { useState, Suspense } from "react"
import { useAuth } from "@/lib/auth-context"
import { useSearchParams } from "next/navigation"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sparkles, FileText, Mail, Loader2, Download, Copy } from "lucide-react"

function NGOAIAssistantContent() {
  const { user } = useAuth()
  const searchParams = useSearchParams()
  const initialTab = searchParams.get('tab') || 'proposal'
  
  const [activeTab, setActiveTab] = useState(initialTab)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedContent, setGeneratedContent] = useState("")

  // Proposal Generator State
  const [projectTitle, setProjectTitle] = useState("")
  const [projectGoal, setProjectGoal] = useState("")
  const [targetAudience, setTargetAudience] = useState("")
  const [budget, setBudget] = useState("")

  // Documentation Helper State
  const [docType, setDocType] = useState("")
  const [docPurpose, setDocPurpose] = useState("")

  // Outreach Creator State
  const [recipientType, setRecipientType] = useState("")
  const [campaignName, setCampaignName] = useState("")
  const [emailPurpose, setEmailPurpose] = useState("")

  const handleGenerate = (type: string) => {
    setIsGenerating(true)
    setTimeout(() => {
      if (type === 'proposal') {
        setGeneratedContent(`Project Proposal: ${projectTitle}

Executive Summary:
Our organization proposes a comprehensive initiative to ${projectGoal.toLowerCase()}. This project aims to positively impact ${targetAudience} through evidence-based interventions and sustainable practices.

Project Objectives:
1. Primary objective aligned with ${projectGoal}
2. Measurable outcomes for beneficiaries
3. Long-term sustainability and community engagement
4. Capacity building and skill development

Budget Overview:
Total Project Budget: ₹${Number(budget).toLocaleString()}
- Program Activities: 60%
- Staff & Operations: 25%
- Monitoring & Evaluation: 10%
- Administrative Costs: 5%

Expected Outcomes:
- Direct impact on ${targetAudience}
- Measurable improvement in quality of life
- Community empowerment and participation
- Sustainable model for replication

Timeline: 12-18 months
Implementation Strategy: Phased approach with quarterly milestones`)
      } else if (type === 'documentation') {
        setGeneratedContent(`${docType} Document

Purpose: ${docPurpose}

Document prepared by: ${user?.name}
Organization: [Your NGO Name]
Date: ${new Date().toLocaleDateString()}

[Content sections will be customized based on your specific needs...]

This is a template structure that can be further customized.`)
      } else if (type === 'outreach') {
        setGeneratedContent(`Subject: Partnership Opportunity - ${campaignName}

Dear ${recipientType},

I hope this email finds you well. I am reaching out on behalf of [Your NGO Name] regarding ${emailPurpose}.

Our organization has been working in [your focus area] for [X years], and we have successfully impacted [number] beneficiaries through our programs.

We believe that a partnership with your organization could create meaningful synergies and amplify our collective impact.

Key highlights of our work:
• Community-driven approach
• Evidence-based interventions
• Sustainable impact models
• Transparent reporting

We would appreciate the opportunity to discuss this further at your convenience.

Thank you for your time and consideration.

Warm regards,
${user?.name}
[Your Position]
[Contact Information]`)
      }
      setIsGenerating(false)
    }, 2000)
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedContent)
  }

  if (user?.user_type !== 'ngo') {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>This feature is only available for NGO accounts.</CardDescription>
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
          <h1 className="text-4xl font-bold text-udaan-navy mb-2">AI Assistant for NGOs</h1>
          <p className="text-gray-600">Generate proposals, documentation, and outreach materials with AI</p>
        </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full md:w-[600px] grid-cols-3">
          <TabsTrigger value="proposal">Proposal Generator</TabsTrigger>
          <TabsTrigger value="documentation">Documentation</TabsTrigger>
          <TabsTrigger value="outreach">Outreach Creator</TabsTrigger>
        </TabsList>

        <TabsContent value="proposal">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-udaan-orange" />
                  Proposal Generator
                </CardTitle>
                <CardDescription>Create compelling project proposals in minutes</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="projectTitle">Project Title</Label>
                  <Input
                    id="projectTitle"
                    placeholder="e.g., Girls Education Empowerment Program"
                    value={projectTitle}
                    onChange={(e) => setProjectTitle(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="projectGoal">Project Goal</Label>
                  <Textarea
                    id="projectGoal"
                    placeholder="Describe the main goal of your project..."
                    rows={3}
                    value={projectGoal}
                    onChange={(e) => setProjectGoal(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="targetAudience">Target Audience</Label>
                  <Input
                    id="targetAudience"
                    placeholder="e.g., Underprivileged girls aged 10-16"
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="budget">Project Budget (INR)</Label>
                  <Input
                    id="budget"
                    type="number"
                    placeholder="500000"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                  />
                </div>
                <Button
                  className="w-full bg-udaan-orange hover:bg-udaan-orange/90"
                  onClick={() => handleGenerate('proposal')}
                  disabled={!projectTitle || !projectGoal || isGenerating}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Generate Proposal
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Generated Proposal</CardTitle>
                  {generatedContent && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={copyToClipboard}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="outline">
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {generatedContent ? (
                  <div className="bg-gray-50 p-4 rounded-lg max-h-[600px] overflow-y-auto">
                    <pre className="whitespace-pre-wrap text-sm font-mono">{generatedContent}</pre>
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Your generated proposal will appear here</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="documentation">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-udaan-orange" />
                  Documentation Helper
                </CardTitle>
                <CardDescription>Create various documents for your NGO operations</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="docType">Document Type</Label>
                  <Input
                    id="docType"
                    placeholder="e.g., Annual Report, MoU, Impact Assessment"
                    value={docType}
                    onChange={(e) => setDocType(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="docPurpose">Document Purpose</Label>
                  <Textarea
                    id="docPurpose"
                    placeholder="Describe what this document is for..."
                    rows={4}
                    value={docPurpose}
                    onChange={(e) => setDocPurpose(e.target.value)}
                  />
                </div>
                <Button
                  className="w-full bg-udaan-orange hover:bg-udaan-orange/90"
                  onClick={() => handleGenerate('documentation')}
                  disabled={!docType || !docPurpose || isGenerating}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Generate Document
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Generated Document</CardTitle>
                  {generatedContent && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={copyToClipboard}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="outline">
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {generatedContent ? (
                  <div className="bg-gray-50 p-4 rounded-lg max-h-[600px] overflow-y-auto">
                    <pre className="whitespace-pre-wrap text-sm font-mono">{generatedContent}</pre>
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Your generated document will appear here</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="outreach">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5 text-udaan-orange" />
                  Outreach Creator
                </CardTitle>
                <CardDescription>Generate professional outreach emails</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="recipientType">Recipient Type</Label>
                  <Input
                    id="recipientType"
                    placeholder="e.g., Corporate Partner, Donor, Volunteer"
                    value={recipientType}
                    onChange={(e) => setRecipientType(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="campaignName">Campaign/Initiative Name</Label>
                  <Input
                    id="campaignName"
                    placeholder="e.g., Winter Relief Drive 2025"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="emailPurpose">Email Purpose</Label>
                  <Textarea
                    id="emailPurpose"
                    placeholder="What is the goal of this outreach?"
                    rows={3}
                    value={emailPurpose}
                    onChange={(e) => setEmailPurpose(e.target.value)}
                  />
                </div>
                <Button
                  className="w-full bg-udaan-orange hover:bg-udaan-orange/90"
                  onClick={() => handleGenerate('outreach')}
                  disabled={!recipientType || !campaignName || isGenerating}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Generate Email
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Generated Email</CardTitle>
                  {generatedContent && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={copyToClipboard}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {generatedContent ? (
                  <div className="bg-gray-50 p-4 rounded-lg max-h-[600px] overflow-y-auto">
                    <pre className="whitespace-pre-wrap text-sm font-mono">{generatedContent}</pre>
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Your generated email will appear here</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
    </>
  )
}

export default function NGOAIAssistantPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background"><Header /><div className="container mx-auto px-4 py-8">Loading...</div></div>}>
      <NGOAIAssistantContent />
    </Suspense>
  )
}
