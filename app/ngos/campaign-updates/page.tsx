"use client"

import { useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Calendar, Upload, Image, Video, FileText, Send } from "lucide-react"

export default function CampaignUpdatesPage() {
  const { user } = useAuth()
  const [selectedCampaign, setSelectedCampaign] = useState("")
  const [updateTitle, setUpdateTitle] = useState("")
  const [updateContent, setUpdateContent] = useState("")
  const [beneficiariesReached, setBeneficiariesReached] = useState("")
  const [milestonesCompleted, setMilestonesCompleted] = useState("")

  const campaigns = [
    { id: '1', name: 'Education Drive 2024', status: 'active', progress: 65 },
    { id: '2', name: 'Healthcare Outreach', status: 'active', progress: 40 },
    { id: '3', name: 'Clean Water Initiative', status: 'active', progress: 85 },
  ]

  const recentUpdates = [
    { 
      date: 'Dec 10, 2024', 
      campaign: 'Education Drive 2024', 
      title: 'Reached 500 Students', 
      excerpt: 'Successfully completed our second phase reaching 500 students...' 
    },
    { 
      date: 'Dec 5, 2024', 
      campaign: 'Healthcare Outreach', 
      title: 'Health Camp Success', 
      excerpt: 'Organized health camps in 3 villages with 200+ beneficiaries...' 
    },
  ]

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
          <h1 className="text-4xl font-bold text-udaan-navy mb-2">Campaign Updates</h1>
          <p className="text-gray-600">Share progress and impact with your stakeholders</p>
        </div>

      <div className="grid md:grid-cols-3 gap-6 mb-8">
        {campaigns.map(campaign => (
          <Card key={campaign.id} className="cursor-pointer hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-center justify-between mb-2">
                <Badge variant={campaign.status === 'active' ? 'default' : 'secondary'}>
                  {campaign.status}
                </Badge>
                <span className="text-sm font-semibold text-udaan-orange">{campaign.progress}%</span>
              </div>
              <CardTitle className="text-lg">{campaign.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-udaan-orange h-2 rounded-full transition-all"
                  style={{ width: `${campaign.progress}%` }}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Post New Update</CardTitle>
            <CardDescription>Share progress reports and impact stories with funders</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="campaign">Select Campaign</Label>
              <select
                id="campaign"
                className="w-full mt-1 p-2 border rounded-lg"
                value={selectedCampaign}
                onChange={(e) => setSelectedCampaign(e.target.value)}
              >
                <option value="">Choose a campaign...</option>
                {campaigns.map(camp => (
                  <option key={camp.id} value={camp.id}>{camp.name}</option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="updateTitle">Update Title</Label>
              <Input
                id="updateTitle"
                placeholder="e.g., Milestone Achieved: 500 Beneficiaries Reached"
                value={updateTitle}
                onChange={(e) => setUpdateTitle(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="updateContent">Update Content</Label>
              <Textarea
                id="updateContent"
                placeholder="Share detailed progress, achievements, challenges, and impact stories..."
                rows={6}
                value={updateContent}
                onChange={(e) => setUpdateContent(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="beneficiaries">Beneficiaries Reached</Label>
                <Input
                  id="beneficiaries"
                  type="number"
                  placeholder="e.g., 250"
                  value={beneficiariesReached}
                  onChange={(e) => setBeneficiariesReached(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="milestones">Milestones Completed</Label>
                <Input
                  id="milestones"
                  type="number"
                  placeholder="e.g., 3"
                  value={milestonesCompleted}
                  onChange={(e) => setMilestonesCompleted(e.target.value)}
                />
              </div>
            </div>

            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
              <div className="text-center">
                <Upload className="h-12 w-12 mx-auto text-gray-400 mb-2" />
                <p className="text-sm text-gray-600 mb-1">Upload supporting media</p>
                <p className="text-xs text-gray-500">Photos, videos, or documents</p>
              </div>
              <div className="flex justify-center gap-2 mt-4">
                <Button size="sm" variant="outline">
                  <Image className="h-4 w-4 mr-1" />
                  Images
                </Button>
                <Button size="sm" variant="outline">
                  <Video className="h-4 w-4 mr-1" />
                  Videos
                </Button>
                <Button size="sm" variant="outline">
                  <FileText className="h-4 w-4 mr-1" />
                  Documents
                </Button>
              </div>
            </div>

            <Button className="w-full bg-udaan-orange hover:bg-udaan-orange/90">
              <Send className="h-4 w-4 mr-2" />
              Post Update
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Updates</CardTitle>
              <CardDescription>Your latest campaign progress reports</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {recentUpdates.map((update, idx) => (
                <div key={idx} className="p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-600">{update.date}</span>
                  </div>
                  <Badge variant="secondary" className="mb-2">{update.campaign}</Badge>
                  <h4 className="font-semibold mb-1">{update.title}</h4>
                  <p className="text-sm text-gray-600">{update.excerpt}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Update Guidelines</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm text-gray-600">
                <li className="flex items-start gap-2">
                  <span className="text-udaan-orange font-bold">•</span>
                  <span>Share concrete metrics and numbers where possible</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-udaan-orange font-bold">•</span>
                  <span>Include beneficiary testimonials and impact stories</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-udaan-orange font-bold">•</span>
                  <span>Add photos and videos to make updates engaging</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-udaan-orange font-bold">•</span>
                  <span>Be transparent about challenges and learnings</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-udaan-orange font-bold">•</span>
                  <span>Post regular updates to maintain stakeholder trust</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
