"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Header } from "@/components/header"
import { PlatformActivityFeed } from "@/components/platform-activity-feed"
import { PlatformAnnouncements } from "@/components/platform-announcements"
import { Leaderboard } from "@/components/leaderboard"
import { StatsGrowth } from "@/components/stats-growth"
import { RecentVerifications } from "@/components/recent-verifications"
import { StickyFooter } from "@/components/sticky-footer"
import { useAuth } from "@/lib/auth-context"
import { 
  TrendingUp, 
  Users, 
  Building, 
  HandHeart,
  BarChart3,
  ArrowRight
} from "lucide-react"

interface PlatformStats {
  activeUsers: number
  partnerNGOs: number
  partnerCompanies: number
  successStories: number
}

export default function HomePage() {
  const { user } = useAuth()
  const [mounted, setMounted] = useState(false)
  const [stats, setStats] = useState<PlatformStats>({
    activeUsers: 0,
    partnerNGOs: 0,
    partnerCompanies: 0,
    successStories: 0
  })
  const [statsLoading, setStatsLoading] = useState(true)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/stats', { headers: { 'Cache-Control': 'no-cache' } })
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
        console.error('Stats error:', err)
      } finally {
        setStatsLoading(false)
      }
    }

    fetchStats()
    const interval = setInterval(fetchStats, 60000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
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
                <div className="w-2 h-12 bg-gradient-to-b from-yellow-400 via-orange-500 to-pink-600 rounded-full"></div>
                <h1 className="text-5xl md:text-6xl font-bold tracking-tight watery-gradient" style={{ color: 'transparent' }}>
                  नवdrishti
                </h1>
              </div>
              <p className="text-xl text-gray-600 max-w-3xl leading-relaxed ml-5">
                India's comprehensive Operating System for Social Impact. Bridging 2.65 lakh active NGOs, 1000+ CSR-compliant corporates, and millions of changemakers through AI-powered verification, real-time transparency, and seamless collaboration—transforming how India allocates and monitors its ₹30,000 crore annual CSR funding for measurable community development.
              </p>
            </div>
            
            {/* Platform Announcements */}
            <PlatformAnnouncements />
            
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden mb-4">
              <div className="bg-gray-900 px-6 py-4">
                <div className="flex items-center gap-3">
                  <TrendingUp className="w-6 h-6 text-yellow-400" />
                  <div>
                    <h2 className="text-xl font-bold watery-gradient" style={{ color: 'transparent' }}>Platform Activity</h2>
                    <p className="text-sm text-gray-400">
                      Recent updates and activities across the platform
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
            <PlatformActivityFeed />
          </div>

          {/* Right Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            {/* Quick Stats */}
            <div className="p-[2px] rounded-lg bg-gradient-to-br from-yellow-400 via-orange-500 to-pink-600">
            <Card className="border-0 bg-white shadow-lg">
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
            </div>
            
            {/* Leaderboard */}
            <Leaderboard />
            
            {/* Stats Growth */}
            <StatsGrowth />
            
            {/* Recent Verifications */}
            <RecentVerifications />
            
            {/* Footer */}
            <StickyFooter />
          </div>
        </div>
      </div>
    </div>
  )
}

