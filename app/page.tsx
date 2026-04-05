"use client"

import { useState, useEffect } from "react"
import dynamic from "next/dynamic"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Header } from "@/components/header"
import { 
  TrendingUp, 
} from "lucide-react"

const PlatformAnnouncements = dynamic(
  () => import("@/components/platform-announcements").then((m) => m.PlatformAnnouncements),
  {
    loading: () => null
  }
)

const PlatformActivityFeed = dynamic(
  () => import("@/components/platform-activity-feed").then((m) => m.PlatformActivityFeed),
  {
    loading: () => (
      <div className="h-72 rounded-2xl border border-white/20 bg-white/10 animate-pulse" />
    )
  }
)

const Leaderboard = dynamic(
  () => import("@/components/leaderboard").then((m) => m.Leaderboard),
  {
    loading: () => (
      <Card className="border-2 border-gray-200 bg-white shadow-lg"><CardContent className="p-6"><div className="h-48 animate-pulse rounded bg-gray-100" /></CardContent></Card>
    )
  }
)

const StatsGrowth = dynamic(
  () => import("@/components/stats-growth").then((m) => m.StatsGrowth),
  {
    loading: () => (
      <Card className="border-2 border-gray-200 bg-white shadow-lg"><CardContent className="p-6"><div className="h-36 animate-pulse rounded bg-gray-100" /></CardContent></Card>
    )
  }
)

const RecentVerifications = dynamic(
  () => import("@/components/recent-verifications").then((m) => m.RecentVerifications),
  {
    loading: () => (
      <Card className="border-2 border-gray-200 bg-white shadow-lg"><CardContent className="p-6"><div className="h-40 animate-pulse rounded bg-gray-100" /></CardContent></Card>
    )
  }
)

const StickyFooter = dynamic(
  () => import("@/components/sticky-footer").then((m) => m.StickyFooter),
  {
    loading: () => null
  }
)

interface PlatformStats {
  activeUsers: number
  partnerNGOs: number
  partnerCompanies: number
  successStories: number
}

export default function HomePage() {
  const [stats, setStats] = useState<PlatformStats>({
    activeUsers: 0,
    partnerNGOs: 0,
    partnerCompanies: 0,
    successStories: 0
  })
  const [statsLoading, setStatsLoading] = useState(true)
  const [showActivityFeed, setShowActivityFeed] = useState(false)
  const [showSecondaryWidgets, setShowSecondaryWidgets] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    const fetchStats = async () => {
      try {
        const res = await fetch('/api/stats', { signal: controller.signal })
        const data = await res.json()
        if (data.success) {
          setStats({
            activeUsers: data.stats.activeUsers || 0,
            partnerNGOs: data.stats.partnerNGOs || 0,
            partnerCompanies: data.stats.partnerCompanies || 0,
            successStories: data.stats.successStories || 0
          })
        }
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          console.error('Stats error:', err)
        }
      } finally {
        setStatsLoading(false)
      }
    }

    fetchStats()
    const interval = setInterval(fetchStats, 60000)
    return () => {
      controller.abort()
      clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let idleId: number | null = null

    const enableActivityFeed = () => setShowActivityFeed(true)

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleId = (window as any).requestIdleCallback(enableActivityFeed, { timeout: 700 })
    } else {
      timeoutId = setTimeout(enableActivityFeed, 150)
    }

    return () => {
      if (idleId !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        (window as any).cancelIdleCallback(idleId)
      }
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [])

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let idleId: number | null = null

    const enableSecondaryWidgets = () => setShowSecondaryWidgets(true)

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleId = (window as any).requestIdleCallback(enableSecondaryWidgets, { timeout: 1200 })
    } else {
      timeoutId = setTimeout(enableSecondaryWidgets, 350)
    }

    return () => {
      if (idleId !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        (window as any).cancelIdleCallback(idleId)
      }
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [])

  return (
    <div className="min-h-screen bg-blue-600">
      <Header />
      
      <style jsx global>{`
        @keyframes flowingGradient {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }
        .watery-gradient {
          background: linear-gradient(
            90deg,
            #fbbf24,
            #f59e0b,
            #ec4899,
            #f97316,
            #fbbf24
          );
          background-size: 200% 200%;
          animation: flowingGradient 4s ease infinite;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          color: transparent;
        }
        .blue-gradient {
          background: linear-gradient(
            90deg,
            #3b82f6,
            #06b6d4,
            #8b5cf6,
            #3b82f6,
            #06b6d4
          );
          background-size: 200% 200%;
          animation: flowingGradient 4s ease infinite;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          color: transparent;
        }
      `}</style>
      
      <div className="max-w-7xl mx-auto px-4 py-8 md:px-6 lg:px-8">
        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Activity Feed - Takes 2 columns */}
          <div className="lg:col-span-2 space-y-6">
            {/* Header */}
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-2 h-12 bg-blue-600 rounded-full"></div>
                <h1 className="text-5xl md:text-6xl font-bold tracking-tight watery-gradient" style={{ color: 'transparent' }}>
                  नवdrishti
                </h1>
              </div>
              <p className="text-xl text-white max-w-3xl leading-relaxed ml-5">
                India's comprehensive Operating System for Social Impact. Bridging 2.65 lakh active NGOs, 1000+ CSR-compliant corporates, and millions of changemakers through AI-powered verification, real-time transparency, and seamless collaboration—transforming how India allocates and monitors its ₹30,000 crore annual CSR funding for measurable community development.
              </p>
            </div>
            
            {/* Platform Announcements */}
            {showSecondaryWidgets ? <PlatformAnnouncements /> : null}
            
            <div className="bg-white rounded-2xl shadow-sm border-2 border-slate-200 overflow-hidden mb-4">
              <div className="bg-white px-6 py-4 border-b border-slate-200">
                <div className="flex items-center gap-3">
                  <TrendingUp className="w-6 h-6 text-blue-700" />
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Platform Activity</h2>
                    <p className="text-sm text-slate-600">
                      Recent updates and activities across the platform
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
            {showActivityFeed ? (
              <PlatformActivityFeed />
            ) : (
              <div className="space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <Card key={i} className="border-2 border-gray-200 bg-white shadow-sm animate-pulse">
                    <CardContent className="p-6">
                      <div className="flex gap-4">
                        <div className="w-10 h-10 rounded-full bg-gray-200" />
                        <div className="flex-1 space-y-2">
                          <div className="h-4 rounded bg-gray-200 w-3/4" />
                          <div className="h-3 rounded bg-gray-200 w-1/2" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Right Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            {/* Quick Stats */}
            <Card className="border-2 border-gray-200 bg-white shadow-lg">
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold mb-4 text-black">Platform Statistics</h3>
              <div className="space-y-4">
                  <div className="border-b border-gray-100 pb-4">
                    <p className="text-sm text-black mb-1">Active Users</p>
                    {statsLoading ? (
                      <div className="h-12 w-32 bg-gray-200 rounded animate-pulse"></div>
                    ) : (
                      <p className="text-4xl font-bold text-black">
                        {stats.activeUsers.toLocaleString()}+
                      </p>
                    )}
                  </div>

                  <div className="border-b border-gray-100 pb-4">
                    <p className="text-sm text-black mb-1">Companies</p>
                    {statsLoading ? (
                      <div className="h-12 w-32 bg-gray-200 rounded animate-pulse"></div>
                    ) : (
                      <p className="text-4xl font-bold text-black">
                        {stats.partnerCompanies.toLocaleString()}+
                      </p>
                    )}
                  </div>

                  <div className="border-b border-gray-100 pb-4">
                    <p className="text-sm text-black mb-1">NGO Partners</p>
                    {statsLoading ? (
                      <div className="h-12 w-32 bg-gray-200 rounded animate-pulse"></div>
                    ) : (
                      <p className="text-4xl font-bold text-black">
                        {stats.partnerNGOs.toLocaleString()}+
                      </p>
                    )}
                  </div>

                  <div>
                    <p className="text-sm text-black mb-1">Success Stories</p>
                    {statsLoading ? (
                      <div className="h-12 w-32 bg-gray-200 rounded animate-pulse"></div>
                    ) : (
                      <p className="text-4xl font-bold text-black">
                        {stats.successStories.toLocaleString()}+
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
            
            {/* Leaderboard */}
            {showSecondaryWidgets ? (
              <Leaderboard />
            ) : (
              <Card className="border-2 border-gray-200 bg-white shadow-lg">
                <CardContent className="p-6"><div className="h-48 animate-pulse rounded bg-gray-100" /></CardContent>
              </Card>
            )}
            
            {/* Stats Growth */}
            {showSecondaryWidgets ? (
              <StatsGrowth />
            ) : (
              <Card className="border-2 border-gray-200 bg-white shadow-lg">
                <CardContent className="p-6"><div className="h-36 animate-pulse rounded bg-gray-100" /></CardContent>
              </Card>
            )}
            
            {/* Recent Verifications */}
            {showSecondaryWidgets ? (
              <RecentVerifications />
            ) : (
              <Card className="border-2 border-gray-200 bg-white shadow-lg">
                <CardContent className="p-6"><div className="h-40 animate-pulse rounded bg-gray-100" /></CardContent>
              </Card>
            )}
            
            {/* Footer */}
            {showSecondaryWidgets ? <StickyFooter /> : null}
          </div>
        </div>
      </div>
    </div>
  )
}

