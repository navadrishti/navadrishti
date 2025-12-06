"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth-context"
import { User, LayoutDashboard } from "lucide-react"

interface PlatformStats {
  activeUsers: number
  partnerNGOs: number
  partnerCompanies: number
  successStories: number
}

export default function HomePage() {
  const { user } = useAuth()
  const [stats, setStats] = useState<PlatformStats>({
    activeUsers: 0,
    partnerNGOs: 0,
    partnerCompanies: 0,
    successStories: 0
  })
  const [statsLoading, setStatsLoading] = useState(true)
  const [statsError, setStatsError] = useState<string | null>(null)

  // Fetch real-time stats
  useEffect(() => {
    const fetchStats = async () => {
      setStatsLoading(true)
      setStatsError(null)
      try {
        const response = await fetch('/api/stats', {
          headers: {
            'Cache-Control': 'no-cache'
          }
        })
        
        if (response.ok) {
          const result = await response.json()
          if (result.success) {
            setStats({
              activeUsers: result.stats.activeUsers || 0,
              partnerNGOs: result.stats.partnerNGOs || 0,
              partnerCompanies: result.stats.partnerCompanies || 0,
              successStories: result.stats.successStories || 0
            })
          } else {
            setStatsError(result.error || 'Failed to load statistics')
          }
        } else if (response.status === 503) {
          setStatsError('Database is starting up')
        } else {
          setStatsError('Failed to load statistics')
        }
      } catch (error: any) {
        console.error('Error fetching stats:', error)
        setStatsError(error.message || 'Network error')
      } finally {
        setStatsLoading(false)
      }
    }

    fetchStats()
    
    // Refresh stats every 30 seconds for real-time updates, but only if no error
    const interval = setInterval(() => {
      if (!statsError) {
        fetchStats()
      }
    }, 30000)
    
    return () => clearInterval(interval)
  }, [statsError])

  return (
    <div className="min-h-screen bg-black">
      {/* Top Navigation - Hidden on mobile */}
      <div className="absolute top-6 right-6 z-50 hidden sm:flex gap-3">
        <Link 
          href="/home" 
          className="group"
        >
          <div 
            className="flex justify-center items-center bg-gray-800/80 backdrop-blur-md shadow-xl text-gray-200 hover:text-white transition-all duration-300 hover:bg-gray-700/80 rounded-lg cursor-pointer"
            style={{ 
              padding: '1.25rem 2.5rem', 
              minWidth: '200px',
              fontSize: '1.125rem',
              fontWeight: '500'
            }}
          >
            <User className="w-5 h-5 mr-3" />
            Home
          </div>
        </Link>
        
        {user ? (
          <Link 
            href={`/${user.user_type}s/dashboard`}
            className="group"
          >
            <Button 
              variant="ghost" 
              size="lg"
              className="gradient-border-btn shadow-xl text-white transition-all duration-300 px-8 py-4 h-auto font-medium text-base"
            >
              <LayoutDashboard className="w-5 h-5 mr-3" />
              Dashboard
            </Button>
          </Link>
        ) : (
          <a 
            href="https://navdrishti-portfolio.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            className="group"
          >
            <Button 
              variant="ghost" 
              size="lg"
              className="gradient-border-btn shadow-xl text-white transition-all duration-300 px-8 py-4 h-auto font-medium text-base"
            >
              <LayoutDashboard className="w-5 h-5 mr-3" />
              Portfolio
            </Button>
          </a>
        )}
      </div>

      {/* Photo Grid Hero Section */}
      <div className="relative min-h-screen">
        {/* Grid Container - Optimized layout with better coverage */}
        <div className="grid grid-cols-5 grid-rows-4 gap-1 p-2 h-screen opacity-40">
          
          {/* Row 1 */}
          <div className="relative overflow-hidden rounded-xl shadow-lg">
            <img 
              src="/photos/pic 1.jpeg" 
              alt="Community empowerment"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/5"></div>
          </div>

          <div className="relative overflow-hidden rounded-xl shadow-lg">
            <img 
              src="/photos/pic 2.jpeg" 
              alt="Social innovation"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/5"></div>
          </div>

          {/* Center large image - spans 3 columns, 2 rows */}
          <div className="col-span-3 row-span-2 relative overflow-hidden rounded-2xl shadow-xl">
            <img 
              src="/photos/pic 3.jpeg" 
              alt="Community empowerment through business literacy"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/5"></div>
          </div>

          {/* Row 2 */}
          <div className="relative overflow-hidden rounded-xl shadow-lg">
            <img 
              src="/photos/pic 4.jpeg" 
              alt="Teamwork and collaboration"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/5"></div>
          </div>

          <div className="relative overflow-hidden rounded-xl shadow-lg">
            <img 
              src="/photos/pic 5.jpeg" 
              alt="Community collaboration"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/5"></div>
          </div>

          {/* Row 3 */}
          <div className="relative overflow-hidden rounded-xl shadow-lg">
            <img 
              src="/photos/pic 6.jpeg" 
              alt="Economic development"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/5"></div>
          </div>

          <div className="relative overflow-hidden rounded-xl shadow-lg">
            <img 
              src="/photos/pic 7.jpeg" 
              alt="Education and training"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/5"></div>
          </div>

          <div className="relative overflow-hidden rounded-xl shadow-lg">
            <img 
              src="/photos/pic 8.jpeg" 
              alt="Growth and development"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/5"></div>
          </div>

          <div className="relative overflow-hidden rounded-xl shadow-lg">
            <img 
              src="/photos/pic 9.jpeg" 
              alt="Leadership"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/5"></div>
          </div>

          <div className="relative overflow-hidden rounded-xl shadow-lg">
            <img 
              src="/photos/pic 10.jpeg" 
              alt="Women empowerment"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/5"></div>
          </div>

          {/* Row 4 */}
          <div className="relative overflow-hidden rounded-xl shadow-lg">
            <img 
              src="/photos/pic 11.jpeg" 
              alt="Social innovation"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/5"></div>
          </div>

          <div className="relative overflow-hidden rounded-xl shadow-lg">
            <img 
              src="/photos/pic 12.jpeg" 
              alt="Mentorship"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/5"></div>
          </div>

          <div className="relative overflow-hidden rounded-xl shadow-lg">
            <img 
              src="/photos/pic 13.jpeg" 
              alt="Business development"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/5"></div>
          </div>

          <div className="relative overflow-hidden rounded-xl shadow-lg">
            <img 
              src="/photos/pic 14.jpeg" 
              alt="Sustainability"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/5"></div>
          </div>

          <div className="relative overflow-hidden rounded-xl shadow-lg">
            <img 
              src="/photos/pic 15.jpeg" 
              alt="Community impact"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/5"></div>
          </div>
        </div>

        {/* Enhanced Text and Button Overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ paddingTop: '8rem' }}>
          <div className="text-center pointer-events-auto">
            <h1 className="text-5xl sm:text-6xl md:text-8xl lg:text-9xl xl:text-9xl font-extrabold text-white mb-6 tracking-tight drop-shadow-[0_8px_32px_rgba(0,0,0,0.8)] px-2">
              <span className="bg-gradient-to-r from-white via-blue-100 to-white bg-clip-text text-transparent">
                नवdrishti
              </span>
            </h1>
            <p className="text-xl sm:text-2xl md:text-3xl lg:text-4xl xl:text-5xl text-white/95 mb-10 drop-shadow-[0_4px_16px_rgba(0,0,0,0.7)] max-w-5xl mx-auto leading-relaxed font-medium px-6">
              <span className="block sm:hidden text-center leading-snug">Empowering Communities<br />Through Business Literacy</span>
              <span className="hidden sm:block whitespace-nowrap">Empowering Communities Through Business Literacy</span>
            </p>
            
            {/* Real-time Stats Counter */}
            <div className="grid grid-cols-3 gap-2 sm:gap-4 md:gap-8 mb-12 px-4">
              <div className="text-center">
                <div className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-blue-400 mb-1 sm:mb-2">
                  {statsLoading || statsError ? (
                    <div className="relative overflow-hidden">
                      <div className="h-8 sm:h-12 md:h-14 w-16 sm:w-24 md:w-32 mx-auto bg-blue-400/10 rounded-xl flex items-center justify-center">
                        {statsError ? (
                          <span className="text-xs sm:text-sm text-amber-400">Loading</span>
                        ) : (
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-400/30 to-transparent animate-shimmer"></div>
                        )}
                      </div>
                    </div>
                  ) : (
                    `${stats.activeUsers.toLocaleString()}+`
                  )}
                </div>
                <div className="text-white/70 text-base sm:text-lg uppercase tracking-wide">
                  {statsLoading || statsError ? (
                    <div className="relative overflow-hidden mt-1 sm:mt-2">
                      <div className="h-3 sm:h-4 w-12 sm:w-16 md:w-20 mx-auto bg-gray-400/10 rounded-lg flex items-center justify-center">
                        {!statsError && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-gray-400/30 to-transparent animate-shimmer"></div>}
                      </div>
                    </div>
                  ) : (
                    <>
                      <span className="hidden sm:inline">Active Users</span>
                      <span className="sm:hidden">Users</span>
                    </>
                  )}
                </div>
              </div>
              <div className="text-center">
                <div className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-purple-400 mb-1 sm:mb-2">
                  {statsLoading || statsError ? (
                    <div className="relative overflow-hidden">
                      <div className="h-8 sm:h-12 md:h-14 w-16 sm:w-24 md:w-32 mx-auto bg-purple-400/10 rounded-xl flex items-center justify-center">
                        {statsError ? (
                          <span className="text-xs sm:text-sm text-amber-400">Wait</span>
                        ) : (
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-purple-400/30 to-transparent animate-shimmer"></div>
                        )}
                      </div>
                    </div>
                  ) : (
                    `${stats.partnerCompanies.toLocaleString()}+`
                  )}
                </div>
                <div className="text-white/70 text-base sm:text-lg uppercase tracking-wide">
                  {statsLoading || statsError ? (
                    <div className="relative overflow-hidden mt-1 sm:mt-2">
                      <div className="h-3 sm:h-4 w-12 sm:w-16 md:w-18 mx-auto bg-gray-400/10 rounded-lg flex items-center justify-center">
                        {!statsError && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-gray-400/30 to-transparent animate-shimmer"></div>}
                      </div>
                    </div>
                  ) : (
                    "Companies"
                  )}
                </div>
              </div>
              <div className="text-center">
                <div className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-teal-400 mb-1 sm:mb-2">
                  {statsLoading || statsError ? (
                    <div className="relative overflow-hidden">
                      <div className="h-8 sm:h-12 md:h-14 w-16 sm:w-24 md:w-32 mx-auto bg-teal-400/10 rounded-xl flex items-center justify-center">
                        {statsError ? (
                          <span className="text-xs sm:text-sm text-amber-400">Soon</span>
                        ) : (
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-teal-400/30 to-transparent animate-shimmer"></div>
                        )}
                      </div>
                    </div>
                  ) : (
                    `${stats.partnerNGOs.toLocaleString()}+`
                  )}
                </div>
                <div className="text-white/70 text-base sm:text-lg uppercase tracking-wide">
                  {statsLoading || statsError ? (
                    <div className="relative overflow-hidden mt-1 sm:mt-2">
                      <div className="h-3 sm:h-4 w-12 sm:w-16 md:w-24 mx-auto bg-gray-400/10 rounded-lg flex items-center justify-center">
                        {!statsError && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-gray-400/30 to-transparent animate-shimmer"></div>}
                      </div>
                    </div>
                  ) : (
                    <>
                      <span className="hidden sm:inline">Partner NGOs</span>
                      <span className="sm:hidden">NGOs</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            
            {/* Desktop Buttons - Hide on mobile */}
            <div className="hidden sm:flex flex-col sm:flex-row gap-4 justify-center mt-8">
              <Link href="/home" className="group">
                <div 
                  className="flex justify-center items-center bg-gray-800/80 backdrop-blur-md shadow-xl text-gray-200 hover:text-white transition-all duration-300 hover:bg-gray-700/80 cursor-pointer border border-gray-800 hover:border-gray-700"
                  style={{ 
                    padding: '1.25rem 2.5rem', 
                    minWidth: '200px',
                    fontSize: '1.125rem',
                    fontWeight: '500',
                    borderRadius: '0'
                  }}
                >
                  Explore Platform
                </div>
              </Link>
              <a href="mailto:support@navdrishti.com">
                <button 
                  className="gradient-border-btn shadow-xl text-white transition-all duration-300 h-auto"
                  style={{ 
                    padding: '1.25rem 2.5rem !important', 
                    minWidth: '200px !important',
                    fontSize: '1.125rem !important',
                    fontWeight: '500 !important'
                  }}
                >
                  Contact Support
                </button>
              </a>
            </div>
            
            {/* Mobile Buttons - Show only on mobile */}
            <div className="flex sm:hidden flex-col gap-3 items-center mt-8 px-4 pb-8">
              <Link href="/home" className="group w-full max-w-xs">
                <div 
                  className="flex justify-center items-center bg-gray-800/80 backdrop-blur-md shadow-xl text-gray-200 hover:text-white transition-all duration-300 hover:bg-gray-700/80 rounded-lg cursor-pointer w-full"
                  style={{ 
                    padding: '0.875rem 1.25rem', 
                    fontSize: '0.9rem',
                    fontWeight: '500'
                  }}
                >
                  <User className="w-4 h-4 mr-2" />
                  Home
                </div>
              </Link>
              {user ? (
                <Link 
                  href={`/${user.user_type}s/dashboard`}
                  className="group w-full max-w-xs"
                >
                  <div 
                    className="flex justify-center items-center shadow-xl text-white transition-all duration-300 rounded-lg cursor-pointer gradient-border-btn w-full"
                    style={{ 
                      padding: '0.875rem 1.25rem !important', 
                      fontSize: '0.9rem !important',
                      fontWeight: '500 !important'
                    }}
                  >
                    <LayoutDashboard className="w-4 h-4 mr-2" />
                    Dashboard
                  </div>
                </Link>
              ) : (
                <a 
                  href="https://navdrishti-portfolio.vercel.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group w-full max-w-xs"
                >
                  <div 
                    className="flex justify-center items-center shadow-xl text-white transition-all duration-300 rounded-lg cursor-pointer gradient-border-btn w-full"
                    style={{ 
                      padding: '0.875rem 1.25rem !important', 
                      fontSize: '0.9rem !important',
                      fontWeight: '500 !important'
                    }}
                  >
                    <LayoutDashboard className="w-4 h-4 mr-2" />
                    Portfolio
                  </div>
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Elegant floating elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {/* Premium floating orbs */}
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full animate-float opacity-20"
              style={{
                left: `${15 + i * 25}%`,
                top: `${20 + (i % 2) * 40}%`,
                animationDelay: `${i * 3}s`,
                animationDuration: `${8 + i * 2}s`,
                width: `${8 + i * 6}px`,
                height: `${8 + i * 6}px`,
                background: i % 2 === 0 
                  ? 'radial-gradient(circle, rgba(59,130,246,0.6) 0%, rgba(99,102,241,0.4) 100%)' 
                  : 'radial-gradient(circle, rgba(147,51,234,0.6) 0%, rgba(168,85,247,0.4) 100%)'
              }}
            />
          ))}
        </div>
      </div>

      {/* Design Tool Section - Hidden on mobile */}
      <section className="hidden lg:block w-full min-h-screen bg-gray-900 py-16">
        <div className="max-w-7xl mx-auto px-6">
          {/* Header */}
          <div className="text-center mb-12">
            <h2 className="text-5xl font-bold text-white mb-6">
              How it works?
            </h2>
          </div>

          {/* Main Design Interface - Dark Desktop OS with Ribbon Screensaver Background */}
          <div className="bg-gray-900 rounded-lg shadow-2xl overflow-hidden border border-gray-700 relative">
            {/* Desktop Wallpaper Background - Colorful Ribbons Screensaver */}
            <div className="absolute inset-0 bg-gradient-to-br from-black via-gray-900 to-black overflow-hidden">
              {/* Animated Ribbons */}
              <div className="absolute inset-0">
                {/* Ribbon 1 */}
                <div className="absolute w-full h-8 bg-gradient-to-r from-transparent via-red-500/40 to-transparent transform -rotate-12 animate-pulse" 
                     style={{
                       top: '10%',
                       left: '-20%',
                       animation: 'float 15s linear infinite',
                       animationDelay: '0s'
                     }}>
                </div>
                {/* Ribbon 2 */}
                <div className="absolute w-full h-6 bg-gradient-to-r from-transparent via-blue-500/40 to-transparent transform rotate-6 animate-pulse" 
                     style={{
                       top: '25%',
                       left: '-30%',
                       animation: 'float 20s linear infinite',
                       animationDelay: '3s'
                     }}>
                </div>
                {/* Ribbon 3 */}
                <div className="absolute w-full h-10 bg-gradient-to-r from-transparent via-green-500/40 to-transparent transform -rotate-3 animate-pulse" 
                     style={{
                       top: '45%',
                       left: '-25%',
                       animation: 'float 18s linear infinite',
                       animationDelay: '6s'
                     }}>
                </div>
                {/* Ribbon 4 */}
                <div className="absolute w-full h-7 bg-gradient-to-r from-transparent via-purple-500/40 to-transparent transform rotate-8 animate-pulse" 
                     style={{
                       top: '65%',
                       left: '-35%',
                       animation: 'float 22s linear infinite',
                       animationDelay: '9s'
                     }}>
                </div>
                {/* Ribbon 5 */}
                <div className="absolute w-full h-9 bg-gradient-to-r from-transparent via-yellow-500/40 to-transparent transform -rotate-6 animate-pulse" 
                     style={{
                       top: '80%',
                       left: '-15%',
                       animation: 'float 16s linear infinite',
                       animationDelay: '12s'
                     }}>
                </div>
                {/* Ribbon 6 */}
                <div className="absolute w-full h-5 bg-gradient-to-r from-transparent via-pink-500/40 to-transparent transform rotate-12 animate-pulse" 
                     style={{
                       top: '35%',
                       left: '-40%',
                       animation: 'float 25s linear infinite',
                       animationDelay: '2s'
                     }}>
                </div>
              </div>
              
              {/* Subtle overlay for depth */}
              <div className="absolute inset-0 bg-gradient-to-br from-black/30 via-transparent to-black/30"></div>
            </div>
            
            {/* Desktop Content */}
            <div className="relative h-[600px] flex flex-col">
              {/* Browser Window */}
              <div className="mx-8 mt-8 mb-16 bg-gray-800 rounded-lg shadow-xl flex-1 flex flex-col overflow-hidden border border-gray-600">
                {/* Browser Header - Dark Theme */}
                <div className="bg-gray-700 px-4 py-2 border-b border-gray-600 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {/* Window Controls */}
                    <div className="flex gap-1">
                      <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                      <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                      <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    </div>
                  </div>
                  <div className="flex-1 mx-4">
                    <div className="bg-gray-600 border border-gray-500 rounded-md px-3 py-1 text-sm text-gray-200">
                      🔒 https://Navadrishti.org/community-impact
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span>⟲</span>
                    <span>⟳</span>
                    <span>⋮</span>
                  </div>
                </div>
                
                {/* Website Content Area */}
                <div className="flex-1 bg-gray-800 relative">
                  <video 
                    key="ngo-video"
                    className="w-full h-full object-cover"
                    autoPlay 
                    muted 
                    loop 
                    playsInline
                    preload="auto"
                    style={{
                      willChange: 'transform',
                    }}
                    onError={(e) => {
                      console.error('Video error:', e);
                      console.error('Error code:', e.currentTarget.error?.code);
                      console.error('Error message:', e.currentTarget.error?.message);
                      // Show fallback on error
                      const fallback = document.querySelector('.video-fallback');
                      if (fallback) {
                        (fallback as HTMLElement).style.display = 'flex';
                      }
                    }}
                    onLoadStart={() => console.log('Video loading started')}
                    onCanPlay={() => {
                      console.log('Video can play');
                      // Hide fallback when video can play
                      const fallback = document.querySelector('.video-fallback');
                      if (fallback) {
                        (fallback as HTMLElement).style.display = 'none';
                      }
                    }}
                    onLoadedData={() => console.log('Video data loaded')}
                    onLoadedMetadata={() => console.log('Video metadata loaded')}
                  >
                    <source src="/videos/ngo.mp4" type="video/mp4" />
                    Your browser does not support the video tag.
                  </video>
                  
                  {/* Fallback content - initially hidden */}
                  <div className="video-fallback absolute inset-0 bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-700 flex items-center justify-center" style={{ display: 'none' }}>
                    <div className="text-white text-center">
                      <div className="bg-white/20 backdrop-blur-sm px-3 py-1 rounded text-sm w-fit mb-4 mx-auto">
                        Navadrishti
                      </div>
                      <h3 className="text-2xl font-bold mb-2">
                        Community Impact Video
                      </h3>
                      <p className="text-sm opacity-80">Video: /videos/ngo.mp4</p>
                      <button 
                        className="mt-4 px-4 py-2 bg-white/20 rounded hover:bg-white/30 transition-colors"
                        onClick={() => {
                          const video = document.querySelector('video');
                          if (video) {
                            video.load();
                            video.play().catch(e => console.error('Play failed:', e));
                          }
                        }}
                      >
                        Retry Video
                      </button>
                    </div>
                  </div>
                  
                  {/* Video Controls Overlay */}
                  <div className="absolute bottom-4 left-4 bg-black/80 backdrop-blur-sm rounded-lg px-3 py-2">
                    <div className="flex items-center gap-3 text-white text-sm">
                      <button>⏸️</button>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1 bg-white/30 rounded">
                          <div className="w-1/3 h-1 bg-white rounded"></div>
                        </div>
                        <span className="text-xs">1:23 / 3:45</span>
                      </div>
                      <button>🔊</button>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Desktop Taskbar - Dark Theme with Realistic Icons */}
              <div className="absolute bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur-md border-t border-gray-700 px-4 py-2 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {/* App Icons - 4 Essential Apps */}
                  <div className="flex space-x-3">
                    {/* Microsoft Edge */}
                    <div className="w-8 h-8 cursor-pointer hover:bg-white/10 rounded-sm p-1 transition-all duration-200">
                      <svg className="w-full h-full" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="11" fill="#0078D4"/>
                        <path d="M6.5 12.5c0-3.5 2.8-6.3 6.3-6.3 1.8 0 3.4.8 4.5 2" stroke="white" strokeWidth="2" fill="none"/>
                        <path d="M17.5 11.5c0 3.5-2.8 6.3-6.3 6.3-1.8 0-3.4-.8-4.5-2" stroke="white" strokeWidth="2" fill="none"/>
                      </svg>
                    </div>
                    
                    {/* File Explorer */}
                    <div className="w-8 h-8 cursor-pointer hover:bg-white/10 rounded-sm p-1 transition-all duration-200">
                      <svg className="w-full h-full" viewBox="0 0 24 24" fill="none">
                        <path d="M3 6h6l2 2h10c1 0 1 0 1 1v10c0 1 0 1-1 1H3V6z" fill="#FFB300"/>
                        <path d="M3 9h18v10H3V9z" fill="#FFD54F"/>
                        <path d="M9 6l2 2h10v1H3V6h6z" fill="#FFF176"/>
                      </svg>
                    </div>
                    
                    {/* Discord */}
                    <div className="w-8 h-8 cursor-pointer hover:bg-white/10 rounded-sm p-1 transition-all duration-200">
                      <svg className="w-full h-full" viewBox="0 0 24 24" fill="none">
                        <rect width="24" height="24" fill="#5865F2" rx="4"/>
                        <path d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.09.09 0 0 0-.07.03c-.18.33-.39.76-.53 1.09a16.09 16.09 0 0 0-4.8 0c-.14-.34-.35-.76-.54-1.09-.01-.02-.04-.03-.07-.03-1.5.26-2.93.71-4.27 1.33-.01 0-.02.01-.03.02-2.72 4.07-3.47 8.03-3.1 11.95 0 .02.01.04.03.05 1.8 1.32 3.53 2.12 5.24 2.65.03.01.06 0 .07-.02.4-.55.76-1.13 1.07-1.74.02-.04 0-.08-.04-.09-.57-.22-1.11-.48-1.64-.78-.04-.02-.04-.08-.01-.11.11-.08.22-.17.33-.25.02-.02.05-.02.07-.01 3.44 1.57 7.15 1.57 10.55 0 .02-.01.05-.01.07.01.11.09.22.17.33.26.04.03.04.09-.01.11-.52.31-1.07.56-1.64.78-.04.01-.05.06-.04.09.32.61.68 1.19 1.07 1.74.03.01.06.02.09.01 1.72-.53 3.45-1.33 5.25-2.65.02-.01.03-.03.03-.05.44-4.53-.73-8.46-3.1-11.95-.01-.01-.02-.02-.04-.02zM8.52 14.91c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.84 2.12-1.89 2.12zm6.97 0c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.83 2.12-1.89 2.12z" fill="white"/>
                      </svg>
                    </div>
                    
                    {/* Steam */}
                    <div className="w-8 h-8 cursor-pointer hover:bg-white/10 rounded-sm p-1 transition-all duration-200">
                      <svg className="w-full h-full" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="12" fill="#1b2838"/>
                        <path d="M12 2C6.48 2 2 6.48 2 12c0 2.85 1.2 5.41 3.11 7.24l3.58-1.48c-.05-.3-.08-.61-.08-.93 0-2.21 1.79-4 4-4s4 1.79 4 4-1.79 4-4 4c-.22 0-.44-.02-.65-.06L8.76 22C9.77 21.68 10.84 21.5 12 21.5c5.52 0 10-4.48 10-10S17.52 2 12 2z" fill="#66c0f4"/>
                        <circle cx="17" cy="7" r="2.5" fill="white"/>
                        <circle cx="8.5" cy="15.5" r="3" fill="white"/>
                        <circle cx="8.5" cy="15.5" r="1.5" fill="#1b2838"/>
                      </svg>
                    </div>
                  </div>
                </div>
                
                {/* System Tray - Dark Theme */}
                <div className="flex items-center space-x-3 text-gray-300 text-xs">
                  <div className="cursor-pointer hover:bg-white/10 px-2 py-1 rounded transition-colors">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                    </svg>
                  </div>
                  <div className="cursor-pointer hover:bg-white/10 px-2 py-1 rounded transition-colors">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.07 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z"/>
                    </svg>
                  </div>
                  <div className="cursor-pointer hover:bg-white/10 px-2 py-1 rounded transition-colors">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M15.67 4H14V2c0-.55-.45-1-1-1s-1 .45-1 1v2H9.33C7.6 4 6.4 5.47 6.4 7.2v9.6c0 1.73 1.2 3.2 2.93 3.2h6.34c1.73 0 2.93-1.47 2.93-3.2V7.2C18.6 5.47 17.4 4 15.67 4z"/>
                    </svg>
                  </div>
                  <div className="border-l border-gray-600 pl-3 ml-2">
                    <div className="text-white">2:30 PM</div>
                    <div className="text-gray-400">11/14/2025</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Facilities Section */}
      <section className="w-full bg-gray-950 py-20 relative overflow-hidden">
        {/* Ribbon Background */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="ribbon ribbon-1"></div>
          <div className="ribbon ribbon-2"></div>
          <div className="ribbon ribbon-3"></div>
          <div className="ribbon ribbon-4"></div>
          <div className="ribbon ribbon-5"></div>
          <div className="ribbon ribbon-6"></div>
          <div className="ribbon ribbon-7"></div>
          <div className="ribbon ribbon-8"></div>
        </div>
        
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          {/* Section Header */}
          <div className="text-center mb-16">
            <h2 className="text-5xl font-bold text-white mb-6">
              Our Platform Features
            </h2>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              Discover the comprehensive tools and services that make Navdrishti your one-stop platform for community empowerment and business development.
            </p>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Marketplace Card */}
            <div className="animate-rainbow-border">
              <div className="bg-gray-900/80 backdrop-blur-sm rounded-lg p-6 h-full">
                <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center mb-4 border border-gray-600">
                  <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/>
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-white mb-3">Marketplace</h3>
                <p className="text-gray-400 text-sm mb-4 leading-relaxed">Buy and sell products within our community-driven marketplace. Support local businesses and find unique items.</p>
                <div className="space-y-1 text-xs text-gray-500">
                  <div>• Product listings & management</div>
                  <div>• Secure payment processing</div>
                  <div>• Community ratings & reviews</div>
                </div>
              </div>
            </div>

            {/* Service Exchange Card */}
            <div className="animate-rainbow-border">
              <div className="bg-gray-900/80 backdrop-blur-sm rounded-lg p-6 h-full">
                <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center mb-4 border border-gray-600">
                  <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
                </svg>
              </div>
              <h3 className="text-lg font-medium text-white mb-3">Service Exchange</h3>
              <p className="text-gray-400 text-sm mb-4 leading-relaxed">Offer your skills and find services you need. Connect with professionals and grow your network.</p>
              <div className="space-y-1 text-xs text-gray-500">
                <div>• Skill verification system</div>
                <div>• Service requests & offers</div>
                <div>• Professional networking</div>
              </div>
              </div>
            </div>

            {/* Social Feed Card */}
            <div className="animate-rainbow-border">
              <div className="bg-gray-900/80 backdrop-blur-sm rounded-lg p-6 h-full">
                <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center mb-4 border border-gray-600">
                  <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"/>
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-white mb-3">Social Community</h3>
                <p className="text-gray-400 text-sm mb-4 leading-relaxed">Stay connected with community updates, share experiences, and engage in meaningful discussions.</p>
                <div className="space-y-1 text-xs text-gray-500">
                  <div>• Community posts & updates</div>
                  <div>• Interactive discussions</div>
                  <div>• Event announcements</div>
                </div>
              </div>
            </div>

            {/* Business Dashboard Card */}
            <div className="animate-rainbow-border">
              <div className="bg-gray-900/80 backdrop-blur-sm rounded-lg p-6 h-full">
                <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center mb-4 border border-gray-600">
                  <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-white mb-3">Business Analytics</h3>
                <p className="text-gray-400 text-sm mb-4 leading-relaxed">Track your business performance with detailed analytics and insights to make data-driven decisions.</p>
                <div className="space-y-1 text-xs text-gray-500">
                  <div>• Sales & revenue tracking</div>
                  <div>• Customer insights</div>
                  <div>• Performance reports</div>
                </div>
              </div>
            </div>

            {/* Learning Hub Card */}
            <div className="animate-rainbow-border">
              <div className="bg-gray-900/80 backdrop-blur-sm rounded-lg p-6 h-full">
                <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center mb-4 border border-gray-600">
                  <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-white mb-3">Learning Hub</h3>
                <p className="text-gray-400 text-sm mb-4 leading-relaxed">Access educational resources, courses, and training programs to enhance your business skills.</p>
                <div className="space-y-1 text-xs text-gray-500">
                  <div>• Business literacy courses</div>
                  <div>• Skill development programs</div>
                  <div>• Certification tracking</div>
                </div>
              </div>
            </div>

            {/* Verification System Card */}
            <div className="animate-rainbow-border">
              <div className="bg-gray-900/80 backdrop-blur-sm rounded-lg p-6 h-full">
                <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center mb-4 border border-gray-600">
                  <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-white mb-3">Verification System</h3>
                <p className="text-gray-400 text-sm mb-4 leading-relaxed">Build trust with verified profiles, skills, and business credentials through our comprehensive verification system.</p>
                <div className="space-y-1 text-xs text-gray-500">
                  <div>• Identity verification</div>
                  <div>• Skill authentication</div>
                  <div>• Business validation</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Building Tomorrow's Connected Communities Section */}
      <section className="w-full bg-gradient-to-b from-gray-900 via-gray-950 to-black py-8 relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-teal-500/10"></div>
          {/* Floating elements for visual interest */}
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full animate-float opacity-30"
              style={{
                left: `${10 + i * 15}%`,
                top: `${20 + (i % 2) * 60}%`,
                animationDelay: `${i * 2}s`,
                animationDuration: `${10 + i * 2}s`,
                width: `${4 + i * 2}px`,
                height: `${4 + i * 2}px`,
                background: i % 3 === 0 
                  ? 'radial-gradient(circle, rgba(255,153,51,0.4) 0%, rgba(255,153,51,0.2) 100%)' 
                  : i % 3 === 1
                  ? 'radial-gradient(circle, rgba(19,136,8,0.4) 0%, rgba(19,136,8,0.2) 100%)'
                  : 'radial-gradient(circle, rgba(59,130,246,0.4) 0%, rgba(99,102,241,0.2) 100%)'
              }}
            />
          ))}
        </div>
        
        <div className="max-w-6xl mx-auto px-6 relative z-10">
          {/* Main Message */}
          <div className="mb-4 flex justify-center">
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-0 leading-tight text-center px-4">
              <span className="block sm:hidden">
                Let's join hands to revolutionize{' '}
                <br />
                <span className="inline-block">
                  <span style={{ color: '#FF9933' }}>I</span>
                  <span style={{ color: '#FF9933' }}>n</span>
                  <span style={{ color: '#FFFFFF' }}>d</span>
                  <span style={{ color: '#FFFFFF' }}>i</span>
                  <span style={{ color: '#138808' }}>a</span>
                </span>'s{' '}
                <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-teal-400 bg-clip-text text-transparent">
                  social growth
                </span>{' '}
                <span className="text-red-500">❤️</span>
              </span>
              <span className="hidden sm:block whitespace-nowrap">
                Let's join hands to revolutionize{' '}
                <span className="inline-block">
                  <span style={{ color: '#FF9933' }}>I</span>
                  <span style={{ color: '#FF9933' }}>n</span>
                  <span style={{ color: '#FFFFFF' }}>d</span>
                  <span style={{ color: '#FFFFFF' }}>i</span>
                  <span style={{ color: '#138808' }}>a</span>
                </span>'s{' '}
                <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-teal-400 bg-clip-text text-transparent">
                  social growth
                </span>{' '}
                <span className="text-red-500">❤️</span>
              </span>
            </h2>
          </div>
        </div>
      </section>


    </div>
  )
}

