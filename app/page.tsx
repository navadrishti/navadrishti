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
                  className="flex justify-center items-center bg-gray-800/80 backdrop-blur-md shadow-xl text-gray-200 hover:text-white transition-all duration-300 hover:bg-gray-700/80 rounded-lg cursor-pointer border border-gray-800 hover:border-gray-700"
                  style={{ 
                    padding: '1.25rem 2.5rem', 
                    minWidth: '200px',
                    fontSize: '1.125rem',
                    fontWeight: '500'
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

      {/* Video Section - Hidden on mobile */}
      <section id="video-section" className="hidden lg:block w-full min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 py-16 relative overflow-hidden">
        {/* Animated Grid Background */}
        <div className="absolute inset-0 pointer-events-none opacity-30">
          <div className="absolute inset-0" style={{
            backgroundImage: 'linear-gradient(rgba(147, 51, 234, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(147, 51, 234, 0.1) 1px, transparent 1px)',
            backgroundSize: '50px 50px',
            animation: 'gridMove 20s linear infinite'
          }}></div>
        </div>

        {/* Animated Background Orbs */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute inset-0">
            <div className="absolute w-96 h-96 bg-blue-500/30 rounded-full blur-3xl animate-pulse" style={{ top: '10%', left: '10%' }}></div>
            <div className="absolute w-96 h-96 bg-purple-500/30 rounded-full blur-3xl animate-pulse" style={{ top: '60%', right: '10%', animationDelay: '2s' }}></div>
            <div className="absolute w-96 h-96 bg-pink-500/30 rounded-full blur-3xl animate-pulse" style={{ bottom: '10%', left: '50%', animationDelay: '4s' }}></div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 relative z-10">
          {/* Header */}
          <div className="text-center mb-12">
            <h2 className="text-5xl font-bold text-white mb-6 drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">
              How it works?
            </h2>
          </div>

          {/* Two Column Layout: Video Left, Flowchart Right */}
          <div className="grid grid-cols-[1.5fr_1fr] gap-8 items-start">
            {/* Video Player - Left Side */}
            <div className="group relative rounded-2xl overflow-hidden bg-black animate-rainbow-border">
              <video 
                id="main-video"
                className="w-full h-full object-cover aspect-video"
                playsInline
                preload="metadata"
                muted
                loop
              >
                <source src="/videos/ngo.mp4" type="video/mp4" />
                Your browser does not support the video tag.
              </video>
              
              {/* Full Video Overlay with Controls - Show on Hover */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                {/* Controls at Bottom */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent p-6">
                  <div className="flex items-center gap-4">
                    {/* Play/Pause Button */}
                    <button 
                      id="play-pause-btn"
                      className="w-12 h-12 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md flex items-center justify-center transition-colors"
                      onClick={() => {
                        const video = document.getElementById('main-video') as HTMLVideoElement;
                        const btn = document.getElementById('play-pause-btn');
                        if (video.paused) {
                          video.play();
                          if (btn) btn.innerHTML = '<svg class="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>';
                        } else {
                          video.pause();
                          if (btn) btn.innerHTML = '<svg class="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
                        }
                      }}
                    >
                      <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    </button>

                    {/* Progress Bar */}
                    <div className="flex-1">
                      <div className="relative">
                        <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
                          <div id="progress-fill" className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-100" style={{ width: '0%' }}></div>
                        </div>
                        <input 
                          id="progress-bar"
                          type="range" 
                          min="0" 
                          max="100" 
                          defaultValue="0"
                          className="absolute top-0 left-0 w-full h-2 bg-transparent rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer"
                          onInput={(e) => {
                            const video = document.getElementById('main-video') as HTMLVideoElement;
                            const target = e.target as HTMLInputElement;
                            const time = (parseFloat(target.value) / 100) * video.duration;
                            video.currentTime = time;
                          }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-white/70 mt-1">
                        <span id="current-time" suppressHydrationWarning>0:00</span>
                        <span id="duration" suppressHydrationWarning>0:00</span>
                      </div>
                    </div>

                    {/* Volume Control */}
                    <button 
                      id="mute-btn"
                      className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md flex items-center justify-center transition-colors"
                      onClick={() => {
                        const video = document.getElementById('main-video') as HTMLVideoElement;
                        const btn = document.getElementById('mute-btn');
                        video.muted = !video.muted;
                        if (btn) {
                          btn.innerHTML = video.muted 
                            ? '<svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>'
                            : '<svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>';
                        }
                      }}
                    >
                      <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
                      </svg>
                    </button>

                    {/* Fullscreen Button */}
                    <button 
                      className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md flex items-center justify-center transition-colors"
                      onClick={() => {
                        const video = document.getElementById('main-video') as HTMLVideoElement;
                        if (video.requestFullscreen) {
                          video.requestFullscreen();
                        }
                      }}
                    >
                      <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* User Flow Chart - Right Side */}
            <div className="space-y-4 flex flex-col justify-center h-full">
              {/* Step 1 */}
              <div className="relative pl-8">
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 animate-pulse"></div>
                <div className="absolute left-1.5 top-full w-0.5 h-4 bg-gradient-to-b from-blue-500/50 to-purple-500/50"></div>
                <div className="border-2 border-blue-500/50 rounded-xl p-5 backdrop-blur-sm">
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">Sign Up</h3>
                    <p className="text-gray-400 text-xs">Create your account as an Individual, NGO, or Company</p>
                  </div>
                </div>
              </div>

              {/* Step 2 */}
              <div className="relative pl-8">
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 animate-pulse" style={{ animationDelay: '0.5s' }}></div>
                <div className="absolute left-1.5 top-full w-0.5 h-4 bg-gradient-to-b from-purple-500/50 to-pink-500/50"></div>
                <div className="border-2 border-purple-500/50 rounded-xl p-5 backdrop-blur-sm">
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">Explore</h3>
                    <p className="text-gray-400 text-xs">Browse marketplace, services, and connect with community</p>
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              <div className="relative pl-8">
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 animate-pulse" style={{ animationDelay: '1s' }}></div>
                <div className="absolute left-1.5 top-full w-0.5 h-4 bg-gradient-to-b from-pink-500/50 to-orange-500/50"></div>
                <div className="border-2 border-pink-500/50 rounded-xl p-5 backdrop-blur-sm">
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">Engage</h3>
                    <p className="text-gray-400 text-xs">Post, request services, buy/sell products, and collaborate</p>
                  </div>
                </div>
              </div>

              {/* Step 4 */}
              <div className="relative pl-8">
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 animate-pulse" style={{ animationDelay: '1.5s' }}></div>
                <div className="border-2 border-orange-500/50 rounded-xl p-5 backdrop-blur-sm">
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">Impact</h3>
                    <p className="text-gray-400 text-xs">Make a difference and grow your network in the community</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Video Event Listeners */}
        <script dangerouslySetInnerHTML={{ __html: `
          document.addEventListener('DOMContentLoaded', function() {
            const video = document.getElementById('main-video');
            const progressBar = document.getElementById('progress-bar');
            const progressFill = document.getElementById('progress-fill');
            const currentTimeEl = document.getElementById('current-time');
            const durationEl = document.getElementById('duration');
            const videoSection = document.getElementById('video-section');
            let hasAutoPlayed = false;

            if (video) {
              // Handle video metadata
              video.addEventListener('loadedmetadata', function() {
                const duration = Math.floor(video.duration);
                const mins = Math.floor(duration / 60);
                const secs = duration % 60;
                durationEl.textContent = mins + ':' + (secs < 10 ? '0' : '') + secs;
              });

              // Update progress bar and visual fill
              video.addEventListener('timeupdate', function() {
                const progress = (video.currentTime / video.duration) * 100;
                if (progressBar) {
                  progressBar.value = progress;
                }
                if (progressFill) {
                  progressFill.style.width = progress + '%';
                }
                
                const currentTime = Math.floor(video.currentTime || 0);
                const mins = Math.floor(currentTime / 60);
                const secs = currentTime % 60;
                if (currentTimeEl) {
                  currentTimeEl.textContent = mins + ':' + (secs < 10 ? '0' : '') + secs;
                }
              });

              // Reset play button on video end
              video.addEventListener('ended', function() {
                const btn = document.getElementById('play-pause-btn');
                btn.innerHTML = '<svg class="w-6 h-6 text-white ml-1 drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
              });

              // Autoplay when scrolled into view
              const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                  if (entry.isIntersecting && !hasAutoPlayed) {
                    // Wait a bit for smooth effect
                    setTimeout(() => {
                      video.play().then(() => {
                        const btn = document.getElementById('play-pause-btn');
                        if (btn) {
                          btn.innerHTML = '<svg class="w-6 h-6 text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>';
                        }
                        hasAutoPlayed = true;
                      }).catch(err => {
                        console.log('Autoplay prevented:', err);
                      });
                    }, 300);
                  }
                });
              }, {
                threshold: 0.5 // Trigger when 50% of the section is visible
              });

              if (videoSection) {
                observer.observe(videoSection);
              }
            }
          });
        ` }} />
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

