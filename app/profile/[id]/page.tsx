"use client"

import { use, useEffect, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { Header } from "@/components/header"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Calendar, MapPin, Award, TrendingUp, Heart, Users, Target, Trophy } from "lucide-react"

interface ImpactProfileProps {
  params: Promise<{
    id: string
  }>
}

export default function ImpactProfilePage({ params }: ImpactProfileProps) {
  const { id } = use(params)
  const searchParams = useSearchParams()
  const activeTab = searchParams.get('tab') || 'history'
  const tabsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Only scroll to tabs if explicitly set via URL parameter
    if (searchParams.get('tab') && tabsRef.current) {
      setTimeout(() => {
        tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    }
  }, [searchParams])

  // Mock data - would come from API
  const profile = {
    name: "John Doe",
    email: "john.doe@example.com",
    location: "Bangalore, Karnataka",
    joinedDate: "January 2024",
    bio: "Passionate about making a difference in education and community development",
    profileImage: "",
    stats: {
      volunteersHours: 156,
      campaignsJoined: 12,
      impactScore: 85,
      livesImpacted: 250
    }
  }

  const activities = [
    {
      date: "Dec 10, 2024",
      title: "Volunteered at Education Drive",
      type: "volunteer",
      description: "Helped 50 students with study materials and mentorship",
      hours: 8
    },
    {
      date: "Nov 25, 2024",
      title: "Donated to Healthcare Initiative",
      type: "donation",
      description: "Contributed ₹5,000 to support rural healthcare camps",
      amount: 5000
    },
    {
      date: "Nov 15, 2024",
      title: "Completed Clean River Project",
      type: "achievement",
      description: "Successfully completed 40 hours in environmental cleanup",
      hours: 40
    },
  ]

  const badges = [
    { name: "Early Adopter", icon: "🌟", description: "One of the first 100 members" },
    { name: "Super Volunteer", icon: "💪", description: "Completed 100+ volunteer hours" },
    { name: "Education Champion", icon: "📚", description: "Contributed to 10+ education initiatives" },
    { name: "Consistent Helper", icon: "❤️", description: "Active for 6+ months" },
  ]

  const impactMetrics = [
    { label: "Students Mentored", value: 45, icon: Users, color: "text-blue-600" },
    { label: "Communities Served", value: 8, icon: MapPin, color: "text-green-600" },
    { label: "Projects Completed", value: 12, icon: Target, color: "text-purple-600" },
    { label: "Recognition Earned", value: 4, icon: Trophy, color: "text-yellow-600" },
  ]

  return (
    <>
      <Header />
      <div className="container mx-auto px-4 py-8">
        <Card className="mb-8">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-6">
              <Avatar className="h-32 w-32">
                <AvatarImage src={profile.profileImage} />
                <AvatarFallback className="text-3xl bg-udaan-orange text-white">
                  {profile.name.split(' ').map(n => n[0]).join('')}
                </AvatarFallback>
              </Avatar>
            
            <div className="flex-1">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h1 className="text-3xl font-bold text-udaan-navy mb-1">{profile.name}</h1>
                  <div className="flex items-center gap-4 text-gray-600 text-sm mb-2">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-4 w-4" />
                      {profile.location}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      Joined {profile.joinedDate}
                    </span>
                  </div>
                  <p className="text-gray-700">{profile.bio}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <p className="text-2xl font-bold text-blue-600">{profile.stats.volunteersHours}</p>
                  <p className="text-sm text-gray-600">Volunteer Hours</p>
                </div>
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <p className="text-2xl font-bold text-green-600">{profile.stats.campaignsJoined}</p>
                  <p className="text-sm text-gray-600">Campaigns</p>
                </div>
                <div className="text-center p-3 bg-purple-50 rounded-lg">
                  <p className="text-2xl font-bold text-purple-600">{profile.stats.impactScore}</p>
                  <p className="text-sm text-gray-600">Impact Score</p>
                </div>
                <div className="text-center p-3 bg-orange-50 rounded-lg">
                  <p className="text-2xl font-bold text-orange-600">{profile.stats.livesImpacted}</p>
                  <p className="text-sm text-gray-600">Lives Impacted</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div ref={tabsRef}>
        <Tabs value={activeTab} className="space-y-6">
          <TabsList className="grid w-full md:w-[600px] grid-cols-3">
            <TabsTrigger value="history">Activity History</TabsTrigger>
            <TabsTrigger value="achievements">Achievements</TabsTrigger>
            <TabsTrigger value="impact">Impact Metrics</TabsTrigger>
          </TabsList>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Volunteer Journey</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {activities.map((activity, idx) => (
                  <div key={idx} className="flex gap-4 p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="flex-shrink-0">
                      <div className={`h-12 w-12 rounded-full flex items-center justify-center ${
                        activity.type === 'volunteer' ? 'bg-blue-100' :
                        activity.type === 'donation' ? 'bg-green-100' :
                        'bg-purple-100'
                      }`}>
                        {activity.type === 'volunteer' && <Users className="h-6 w-6 text-blue-600" />}
                        {activity.type === 'donation' && <Heart className="h-6 w-6 text-green-600" />}
                        {activity.type === 'achievement' && <Award className="h-6 w-6 text-purple-600" />}
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-start justify-between mb-1">
                        <h4 className="font-semibold text-udaan-navy">{activity.title}</h4>
                        <span className="text-sm text-gray-500">{activity.date}</span>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">{activity.description}</p>
                      <div className="flex gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {activity.type}
                        </Badge>
                        {activity.hours && (
                          <Badge variant="outline" className="text-xs">
                            {activity.hours} hours
                          </Badge>
                        )}
                        {activity.amount && (
                          <Badge variant="outline" className="text-xs">
                            ₹{activity.amount.toLocaleString()}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="achievements">
          <Card>
            <CardHeader>
              <CardTitle>Badges & Milestones</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4">
                {badges.map((badge, idx) => (
                  <div key={idx} className="flex gap-4 p-4 border rounded-lg hover:shadow-md transition-shadow">
                    <div className="text-4xl">{badge.icon}</div>
                    <div>
                      <h4 className="font-semibold text-udaan-navy mb-1">{badge.name}</h4>
                      <p className="text-sm text-gray-600">{badge.description}</p>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="mt-6 p-4 bg-gradient-to-r from-orange-50 to-pink-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <TrendingUp className="h-6 w-6 text-udaan-orange" />
                  <div>
                    <h4 className="font-semibold text-udaan-navy">Next Milestone</h4>
                    <p className="text-sm text-gray-600">Complete 10 more volunteer hours to unlock "Dedicated Helper" badge</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="impact">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Impact Overview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {impactMetrics.map((metric, idx) => (
                    <div key={idx} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <metric.icon className={`h-5 w-5 ${metric.color}`} />
                        <span className="text-gray-700">{metric.label}</span>
                      </div>
                      <span className={`text-2xl font-bold ${metric.color}`}>{metric.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Impact Story</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <p className="text-gray-700">
                    Through consistent dedication and passion for social causes, this volunteer has made a 
                    significant impact in multiple communities across Karnataka.
                  </p>
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <h4 className="font-semibold text-blue-900 mb-2">Recent Achievement</h4>
                    <p className="text-sm text-blue-800">
                      Mentored 45 underprivileged students, helping 38 of them improve their academic performance 
                      by an average of 25%.
                    </p>
                  </div>
                  <div className="p-4 bg-green-50 rounded-lg">
                    <h4 className="font-semibold text-green-900 mb-2">Community Feedback</h4>
                    <p className="text-sm text-green-800 italic">
                      "A dedicated volunteer who consistently goes above and beyond to help others. Their commitment 
                      to education initiatives has been truly inspiring."
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
      </div>
    </div>
    </>
  )
}
