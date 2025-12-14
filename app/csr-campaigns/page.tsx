"use client"

import { useState } from "react"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Search, MapPin, Calendar, Users, TrendingUp, Filter } from "lucide-react"

interface Campaign {
  id: string
  title: string
  company: string
  category: string
  location: string
  duration: string
  volunteers: number
  status: 'open' | 'ongoing' | 'completed'
  description: string
}

export default function CSRCampaignsPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")

  const campaigns: Campaign[] = [
    {
      id: '1',
      title: 'Education Empowerment Program',
      company: 'TechCorp India',
      category: 'Education',
      location: 'Bangalore, Karnataka',
      duration: '6 months',
      volunteers: 50,
      status: 'open',
      description: 'Help underprivileged students gain access to quality education through mentorship and resources.'
    },
    {
      id: '2',
      title: 'Healthcare for Rural Communities',
      company: 'HealthPlus Foundation',
      category: 'Healthcare',
      location: 'Mumbai, Maharashtra',
      duration: '3 months',
      volunteers: 30,
      status: 'ongoing',
      description: 'Organize health camps and provide medical support to rural communities in Maharashtra.'
    },
    {
      id: '3',
      title: 'Clean River Initiative',
      company: 'EcoTech Solutions',
      category: 'Environment',
      location: 'Delhi NCR',
      duration: '4 months',
      volunteers: 100,
      status: 'open',
      description: 'Join us in cleaning and maintaining the Yamuna river ecosystem through community action.'
    },
    {
      id: '4',
      title: 'Women Skill Development',
      company: 'Empower India Ltd',
      category: 'Women Empowerment',
      location: 'Pune, Maharashtra',
      duration: '12 months',
      volunteers: 25,
      status: 'open',
      description: 'Training and skill development program for women in rural areas to enhance employability.'
    },
    {
      id: '5',
      title: 'Child Nutrition Program',
      company: 'FoodCare Foundation',
      category: 'Child Welfare',
      location: 'Chennai, Tamil Nadu',
      duration: '6 months',
      volunteers: 40,
      status: 'ongoing',
      description: 'Provide nutritious meals and nutritional education to children in underserved communities.'
    },
    {
      id: '6',
      title: 'Digital Literacy Drive',
      company: 'InfoSys Foundation',
      category: 'Education',
      location: 'Hyderabad, Telangana',
      duration: '8 months',
      volunteers: 60,
      status: 'open',
      description: 'Teach basic computer skills and digital literacy to youth in rural and semi-urban areas.'
    },
  ]

  const categories = ['all', 'Education', 'Healthcare', 'Environment', 'Women Empowerment', 'Child Welfare']

  const filteredCampaigns = campaigns.filter(campaign => {
    const matchesSearch = campaign.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         campaign.company.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = selectedCategory === 'all' || campaign.category === selectedCategory
    return matchesSearch && matchesCategory
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-green-100 text-green-800'
      case 'ongoing': return 'bg-blue-100 text-blue-800'
      case 'completed': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <>
      <Header />
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-udaan-navy mb-2">CSR Campaigns</h1>
          <p className="text-gray-600">Discover and participate in corporate social responsibility initiatives</p>
        </div>

      <div className="grid md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Active Campaigns</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-udaan-orange" />
              <span className="text-3xl font-bold text-udaan-navy">12</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Total Volunteers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-green-600" />
              <span className="text-3xl font-bold text-green-600">305</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Companies</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-600" />
              <span className="text-3xl font-bold text-blue-600">8</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Impact Created</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-purple-600" />
              <span className="text-3xl font-bold text-purple-600">85%</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <Input
                placeholder="Search campaigns by name or company..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {categories.map(category => (
                <Button
                  key={category}
                  variant={selectedCategory === category ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedCategory(category)}
                  className={selectedCategory === category ? 'bg-udaan-orange hover:bg-udaan-orange/90' : ''}
                >
                  {category === 'all' ? 'All' : category}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredCampaigns.map(campaign => (
          <Card key={campaign.id} className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-center justify-between mb-2">
                <Badge className={getStatusColor(campaign.status)}>
                  {campaign.status}
                </Badge>
                <Badge variant="outline">{campaign.category}</Badge>
              </div>
              <CardTitle className="text-lg line-clamp-2">{campaign.title}</CardTitle>
              <CardDescription className="font-semibold text-udaan-navy">{campaign.company}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-gray-600 line-clamp-2">{campaign.description}</p>
              
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-udaan-orange" />
                  <span>{campaign.location}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-udaan-orange" />
                  <span>{campaign.duration}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-udaan-orange" />
                  <span>{campaign.volunteers} volunteers needed</span>
                </div>
              </div>

              <Button className="w-full bg-udaan-orange hover:bg-udaan-orange/90">
                {campaign.status === 'open' ? 'Apply Now' : 'View Details'}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredCampaigns.length === 0 && (
        <div className="text-center py-12">
          <Filter className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <p className="text-gray-600">No campaigns found matching your criteria</p>
          <Button 
            variant="outline" 
            className="mt-4"
            onClick={() => {
              setSearchQuery("")
              setSelectedCategory("all")
            }}
          >
            Clear Filters
          </Button>
        </div>
      )}
    </div>
    </>
  )
}
