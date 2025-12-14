"use client"

import { useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Heart, Target, Clock, DollarSign, Users, TrendingUp } from "lucide-react"

export default function FundraisingPage() {
  const { user } = useAuth()
  const [campaignName, setCampaignName] = useState("")
  const [goal, setGoal] = useState("")
  const [duration, setDuration] = useState("")
  const [category, setCategory] = useState("")
  const [description, setDescription] = useState("")

  const activeCampaigns = [
    { name: 'Winter Relief Fund', raised: 125000, goal: 200000, donors: 45, daysLeft: 12 },
    { name: 'Education Support', raised: 350000, goal: 500000, donors: 78, daysLeft: 25 },
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
          <h1 className="text-4xl font-bold text-udaan-navy mb-2">Fundraising Campaigns</h1>
          <p className="text-gray-600">Create and manage fundraising campaigns for your initiatives</p>
        </div>

      <div className="grid md:grid-cols-2 gap-6 mb-8">
        {activeCampaigns.map((campaign, idx) => (
          <Card key={idx}>
            <CardHeader>
              <CardTitle>{campaign.name}</CardTitle>
              <CardDescription>Active Campaign</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="font-medium">₹{campaign.raised.toLocaleString()} raised</span>
                  <span className="text-gray-600">of ₹{campaign.goal.toLocaleString()}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-green-600 h-2 rounded-full"
                    style={{ width: `${(campaign.raised / campaign.goal) * 100}%` }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-udaan-orange" />
                  <span className="text-sm">{campaign.donors} donors</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-udaan-orange" />
                  <span className="text-sm">{campaign.daysLeft} days left</span>
                </div>
              </div>
              <Button variant="outline" className="w-full">View Details</Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Heart className="h-6 w-6 text-udaan-orange" />
            Create New Fundraising Campaign
          </CardTitle>
          <CardDescription>Launch a new campaign to raise funds for your cause</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="campaignName">Campaign Name</Label>
                <Input
                  id="campaignName"
                  placeholder="e.g., Help Us Build a School"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="category">Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="education">Education</SelectItem>
                    <SelectItem value="healthcare">Healthcare</SelectItem>
                    <SelectItem value="environment">Environment</SelectItem>
                    <SelectItem value="disaster">Disaster Relief</SelectItem>
                    <SelectItem value="women">Women Empowerment</SelectItem>
                    <SelectItem value="children">Child Welfare</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="goal">Fundraising Goal (INR)</Label>
                <Input
                  id="goal"
                  type="number"
                  placeholder="500000"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="duration">Campaign Duration (Days)</Label>
                <Input
                  id="duration"
                  type="number"
                  placeholder="30"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="description">Campaign Description</Label>
                <Textarea
                  id="description"
                  placeholder="Tell people why you need their support, what you plan to do with the funds, and the impact it will create..."
                  rows={8}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="p-4 bg-blue-50 rounded-lg">
                <h4 className="font-semibold mb-2 text-blue-900">Campaign Tips</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• Set a realistic and achievable goal</li>
                  <li>• Be specific about fund utilization</li>
                  <li>• Add compelling visuals and stories</li>
                  <li>• Update donors regularly on progress</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-6 p-4 border-2 border-dashed border-gray-300 rounded-lg">
            <div className="text-center">
              <Target className="h-12 w-12 mx-auto text-gray-400 mb-2" />
              <p className="text-sm text-gray-600 mb-1">Upload Campaign Media</p>
              <p className="text-xs text-gray-500">Add photos, videos, or documents to support your campaign</p>
              <Button size="sm" variant="outline" className="mt-3">
                Choose Files
              </Button>
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <Button className="flex-1 bg-green-600 hover:bg-green-700">
              Launch Campaign
            </Button>
            <Button variant="outline" className="flex-1">
              Save as Draft
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Why Fundraise on Navadrishti?</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="flex gap-3">
              <DollarSign className="h-6 w-6 text-udaan-orange flex-shrink-0" />
              <div>
                <h4 className="font-semibold mb-1">Low Platform Fees</h4>
                <p className="text-sm text-gray-600">Minimal transaction fees so more money goes to your cause</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Users className="h-6 w-6 text-udaan-orange flex-shrink-0" />
              <div>
                <h4 className="font-semibold mb-1">Wide Reach</h4>
                <p className="text-sm text-gray-600">Access to a community of socially conscious donors</p>
              </div>
            </div>
            <div className="flex gap-3">
              <TrendingUp className="h-6 w-6 text-udaan-orange flex-shrink-0" />
              <div>
                <h4 className="font-semibold mb-1">Easy Management</h4>
                <p className="text-sm text-gray-600">Simple tools to track, update, and manage your campaigns</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
    </>
  )
}
