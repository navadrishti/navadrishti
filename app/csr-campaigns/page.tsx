"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { StyledSelect } from "@/components/ui/styled-select"
import { Skeleton } from "@/components/ui/skeleton"
import { SkeletonServiceCard } from "@/components/ui/skeleton"
import { Search, MapPin, Calendar, Users, Filter, Sparkles, ArrowRight } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { CSR_SCHEDULE_VII_CATEGORIES } from "@/lib/categories"

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

function CSRCampaignCtaSkeleton() {
  return (
    <div className="mb-8 p-8 bg-white rounded-2xl border-2 border-black shadow-sm relative overflow-hidden">
      <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
        <div className="text-center md:text-left">
          <Skeleton className="h-8 w-72 mb-3" />
          <Skeleton className="h-5 w-full max-w-md" />
        </div>
        <Skeleton className="h-[58px] w-[230px] rounded-lg" />
      </div>
    </div>
  )
}

export default function CSRCampaignsPage() {
  const { user } = useAuth()
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [isHydrated, setIsHydrated] = useState(false)

  const effectiveUserType = isHydrated ? user?.user_type : undefined
  const isIndividual = effectiveUserType === 'individual'
  const isCompany = effectiveUserType === 'company'

  useEffect(() => {
    setIsHydrated(true)
  }, [])

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

  const categories = useMemo(() => ['all', ...CSR_SCHEDULE_VII_CATEGORIES], [])

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

  const categoryOptions = useMemo(
    () => categories.map((category) => ({
      value: category,
      label: category === 'all' ? 'All Categories' : category
    })),
    [categories]
  )

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 px-6 py-8 md:px-10">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">CSR Campaigns</h1>
            <p className="text-muted-foreground">Discover and participate in corporate social responsibility initiatives</p>
          </div>
        </div>

        {loading ? (
          isCompany && <CSRCampaignCtaSkeleton />
        ) : isCompany && (
          <div className="mb-8 p-8 bg-white rounded-2xl border-2 border-black shadow-sm relative overflow-hidden">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
              <div className="text-center md:text-left">
                <h2 className="text-2xl font-bold text-black mb-3">
                  Launch New CSR Campaign?
                </h2>
                <p className="text-gray-700 text-base max-w-md font-medium">
                  Create structured campaign plans through the CSR AI Agent. Manual campaign creation is disabled.
                </p>
              </div>
              <Link href="/companies/csr-agent">
                <button className="bg-white border-2 border-black shadow-sm text-black hover:bg-gray-50 transition-all duration-300 px-8 py-4 h-auto font-medium text-base rounded-lg flex items-center">
                  <Sparkles size={20} className="mr-3" />
                  Use CSR AI Agent
                  <ArrowRight size={16} className="ml-3" />
                </button>
              </Link>
            </div>
          </div>
        )}

        <div className="mb-6 grid gap-6 md:grid-cols-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search campaigns by name or company..."
              className="pl-8"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex gap-4">
            <div className="relative flex-1">
              <StyledSelect
                value={selectedCategory}
                options={categoryOptions}
                placeholder="All Categories"
                onValueChange={setSelectedCategory}
              />
            </div>
          </div>
        </div>

        <div className="min-h-[400px]">
          {loading ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonServiceCard key={i} />
              ))}
            </div>
          ) : filteredCampaigns.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filteredCampaigns.map(campaign => (
                <Card key={campaign.id} className="h-full border-2 border-gray-200 transition-shadow hover:shadow-md flex flex-col">
                  <CardHeader className="space-y-3 pb-4 min-h-[136px]">
                    <div className="flex items-center justify-between gap-2">
                      <Badge className={getStatusColor(campaign.status)}>
                        {campaign.status}
                      </Badge>
                      <Badge variant="outline" className="max-w-[190px] truncate">{campaign.category}</Badge>
                    </div>
                    <CardTitle className="text-lg leading-tight line-clamp-2">{campaign.title}</CardTitle>
                    <p className="text-sm font-semibold text-foreground">{campaign.company}</p>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col space-y-3">
                    <p className="text-sm text-muted-foreground line-clamp-2 min-h-[44px]">{campaign.description}</p>

                    <div className="space-y-2 text-sm text-muted-foreground min-h-[84px]">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-udaan-orange" />
                        <span className="truncate">{campaign.location || 'Location TBD'}</span>
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

                    <Button className="w-full mt-auto bg-udaan-orange hover:bg-udaan-orange/90">
                      {isIndividual ? 'Volunteer Now' : campaign.status === 'open' ? 'Apply Now' : 'View Details'}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
              <div className="mb-4 rounded-full bg-muted p-3">
                <Filter className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="mb-1 text-lg font-semibold">No campaigns found</h3>
              <p className="mb-4 text-muted-foreground">No campaigns match your current search or filters.</p>
              <Button
                variant="outline"
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
      </main>
    </div>
  )
}
