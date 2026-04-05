"use client"

import { useEffect, useMemo, useState } from "react"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, MapPin, Calendar, Users, Filter } from "lucide-react"
import { useAuth } from "@/lib/auth-context"

const SCHEDULE_VII_CATEGORIES = [
  "Eradicating Hunger, Poverty and Malnutrition",
  "Promoting Healthcare and Sanitation",
  "Education and Livelihood Enhancement",
  "Gender Equality and Women Empowerment",
  "Environmental Sustainability",
  "Protection of Heritage, Art and Culture",
  "Support for Armed Forces Veterans",
  "Rural Development Projects",
  "Slum Area Development",
  "Sports Promotion",
  "Disaster Management and Relief",
] as const

const inferScheduleVIICategory = (cause: string) => {
  const normalized = cause.toLowerCase()

  if (/(hunger|poverty|malnutrition|nutrition|food)/.test(normalized)) {
    return "Eradicating Hunger, Poverty and Malnutrition"
  }
  if (/(health|healthcare|hospital|medical|sanitation|swachh|drinking water)/.test(normalized)) {
    return "Promoting Healthcare and Sanitation"
  }
  if (/(education|school|skill|livelihood|training|scholarship|learning)/.test(normalized)) {
    return "Education and Livelihood Enhancement"
  }
  if (/(women|girl|gender|empowerment|orphan|senior|old age|divyang|differently abled)/.test(normalized)) {
    return "Gender Equality and Women Empowerment"
  }
  if (/(environment|climate|tree|forest|river|water conservation|biodiversity|renewable|clean energy)/.test(normalized)) {
    return "Environmental Sustainability"
  }
  if (/(heritage|culture|art|craft|museum|restoration)/.test(normalized)) {
    return "Protection of Heritage, Art and Culture"
  }
  if (/(veteran|armed force|war widow|military)/.test(normalized)) {
    return "Support for Armed Forces Veterans"
  }
  if (/(rural|village|gram|farmer|agri)/.test(normalized)) {
    return "Rural Development Projects"
  }
  if (/(slum|urban poor|informal settlement)/.test(normalized)) {
    return "Slum Area Development"
  }
  if (/(sport|athlete|olympic|paralympic|coach|academy)/.test(normalized)) {
    return "Sports Promotion"
  }
  if (/(disaster|flood|earthquake|cyclone|relief|rehabilitation|calamity)/.test(normalized)) {
    return "Disaster Management and Relief"
  }

  return "Rural Development Projects"
}

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

interface CampaignApiItem {
  id: string
  title: string | null
  description: string | null
  cause: string
  region: string
  timeline: number | null
  company_id: number | null
  created_at: string
}

export default function CSRCampaignsPage() {
  const { user } = useAuth()
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)

  const isIndividual = user?.user_type === 'individual'

  useEffect(() => {
    const loadCampaigns = async () => {
      setLoading(true)

      try {
        const response = await fetch('/api/campaigns')
        const payload = await response.json()

        if (!response.ok || !payload?.success) {
          setCampaigns([])
          return
        }

        const rows = Array.isArray(payload.data) ? (payload.data as CampaignApiItem[]) : []

        const normalized = rows.map((item) => ({
          id: item.id,
          title: item.title || item.cause,
          company: item.company_id ? `Company #${item.company_id}` : 'Company',
          category: inferScheduleVIICategory(item.cause || ''),
          location: item.region,
          duration: item.timeline ? `${item.timeline} months` : 'Flexible timeline',
          volunteers: 0,
          status: 'open' as const,
          description: item.description || 'No campaign description provided yet.'
        }))

        setCampaigns(normalized)
      } catch (error) {
        console.error('Failed to load campaigns:', error)
        setCampaigns([])
      } finally {
        setLoading(false)
      }
    }

    loadCampaigns()
  }, [])

  const categories = useMemo(() => ['all', ...SCHEDULE_VII_CATEGORIES], [])

  const filteredCampaigns = campaigns.filter(campaign => {
    const matchesSearch = campaign.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         campaign.company.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = selectedCategory === 'all' || campaign.category === selectedCategory
    const matchesStatus = !isIndividual || campaign.status === 'ongoing'
    return matchesSearch && matchesCategory && matchesStatus
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

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <Input
                placeholder="Search campaigns by name or company..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="relative">
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category === 'all' ? 'All Categories' : category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="rounded-md border p-8 text-center text-gray-600">Loading campaigns...</div>
      ) : (
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
                {isIndividual ? 'Volunteer Now' : campaign.status === 'open' ? 'Apply Now' : 'View Details'}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      )}

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
