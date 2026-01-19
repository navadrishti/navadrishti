"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
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
  const [mounted, setMounted] = useState(false)
  const [stats, setStats] = useState<PlatformStats>({
    activeUsers: 0,
    partnerNGOs: 0,
    partnerCompanies: 0,
    successStories: 0
  })
  const [statsLoading, setStatsLoading] = useState(true)
  const [statsError, setStatsError] = useState<string | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

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
      {/* Photo Grid Hero Section */}
      <div className="relative min-h-screen">
        {/* Grid Container - Fixed height to prevent glitching */}
        <div className="grid grid-cols-5 grid-rows-4 gap-1 p-2 h-screen opacity-40 will-change-auto">
          
          {/* Row 1 */}
          <div className="relative overflow-hidden rounded-xl shadow-lg bg-gray-900">
            <Image 
              src="/photos/pic 1.jpeg" 
              alt="Community empowerment"
              fill
              className="object-cover"
              sizes="20vw"
              loading="eager"
              quality={85}
            />
            <div className="absolute inset-0 bg-black/5"></div>
          </div>

          <div className="relative overflow-hidden rounded-xl shadow-lg bg-gray-900">
            <Image 
              src="/photos/pic 2.jpeg" 
              alt="Social innovation"
              fill
              className="object-cover"
              sizes="20vw"
              loading="eager"
              quality={85}
            />
            <div className="absolute inset-0 bg-black/5"></div>
          </div>

          {/* Center large image - spans 3 columns, 2 rows */}
          <div className="col-span-3 row-span-2 relative overflow-hidden rounded-2xl shadow-xl bg-gray-900">
            <Image 
              src="/photos/pic 3.jpeg" 
              alt="Community empowerment through business literacy"
              fill
              className="object-cover"
              sizes="60vw"
              loading="eager"
              quality={90}
            />
            <div className="absolute inset-0 bg-black/5"></div>
          </div>

          {/* Row 2 */}
          <div className="relative overflow-hidden rounded-xl shadow-lg bg-gray-900">
            <Image 
              src="/photos/pic 4.jpeg" 
              alt="Teamwork and collaboration"
              fill
              className="object-cover"
              sizes="20vw"
              loading="eager"
              quality={85}
            />
            <div className="absolute inset-0 bg-black/5"></div>
          </div>

          <div className="relative overflow-hidden rounded-xl shadow-lg bg-gray-900">
            <Image 
              src="/photos/pic 5.jpeg" 
              alt="Community collaboration"
              fill
              className="object-cover"
              sizes="20vw"
              loading="eager"
              quality={85}
            />
            <div className="absolute inset-0 bg-black/5"></div>
          </div>

          {/* Row 3 */}
          <div className="relative overflow-hidden rounded-xl shadow-lg bg-gray-900">
            <Image 
              src="/photos/pic 6.jpeg" 
              alt="Economic development"
              fill
              className="object-cover"
              sizes="20vw"
              loading="eager"
              quality={85}
            />
            <div className="absolute inset-0 bg-black/5"></div>
          </div>

          <div className="relative overflow-hidden rounded-xl shadow-lg bg-gray-900">
            <Image 
              src="/photos/pic 7.jpeg" 
              alt="Education and training"
              fill
              className="object-cover"
              sizes="20vw"
              loading="eager"
              quality={85}
            />
            <div className="absolute inset-0 bg-black/5"></div>
          </div>

          <div className="relative overflow-hidden rounded-xl shadow-lg bg-gray-900">
            <Image 
              src="/photos/pic 8.jpeg" 
              alt="Growth and development"
              fill
              className="object-cover"
              sizes="20vw"
              loading="eager"
              quality={85}
            />
            <div className="absolute inset-0 bg-black/5"></div>
          </div>

          <div className="relative overflow-hidden rounded-xl shadow-lg bg-gray-900">
            <Image 
              src="/photos/pic 9.jpeg" 
              alt="Leadership"
              fill
              className="object-cover"
              sizes="20vw"
              loading="eager"
              quality={85}
            />
            <div className="absolute inset-0 bg-black/5"></div>
          </div>

          <div className="relative overflow-hidden rounded-xl shadow-lg bg-gray-900">
            <Image 
              src="/photos/pic 10.jpeg" 
              alt="Women empowerment"
              fill
              className="object-cover"
              sizes="20vw"
              loading="eager"
              quality={85}
            />
            <div className="absolute inset-0 bg-black/5"></div>
          </div>

          {/* Row 4 */}
          <div className="relative overflow-hidden rounded-xl shadow-lg bg-gray-900">
            <Image 
              src="/photos/pic 11.jpeg" 
              alt="Social innovation"
              fill
              className="object-cover"
              sizes="20vw"
              loading="eager"
              quality={85}
            />
            <div className="absolute inset-0 bg-black/5"></div>
          </div>

          <div className="relative overflow-hidden rounded-xl shadow-lg bg-gray-900">
            <Image 
              src="/photos/pic 12.jpeg" 
              alt="Mentorship"
              fill
              className="object-cover"
              sizes="20vw"
              loading="eager"
              quality={85}
            />
            <div className="absolute inset-0 bg-black/5"></div>
          </div>

          <div className="relative overflow-hidden rounded-xl shadow-lg bg-gray-900">
            <Image 
              src="/photos/pic 13.jpeg" 
              alt="Business development"
              fill
              className="object-cover"
              sizes="20vw"
              loading="eager"
              quality={85}
            />
            <div className="absolute inset-0 bg-black/5"></div>
          </div>

          <div className="relative overflow-hidden rounded-xl shadow-lg bg-gray-900">
            <Image 
              src="/photos/pic 14.jpeg" 
              alt="Sustainability"
              fill
              className="object-cover"
              sizes="20vw"
              loading="eager"
              quality={85}
            />
            <div className="absolute inset-0 bg-black/5"></div>
          </div>

          <div className="relative overflow-hidden rounded-xl shadow-lg bg-gray-900">
            <Image 
              src="/photos/pic 15.jpeg" 
              alt="Community impact"
              fill
              className="object-cover"
              sizes="20vw"
              loading="eager"
              quality={85}
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
                <div className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-blue-400 mb-1 sm:mb-2 min-h-[2rem] sm:min-h-[3rem] md:min-h-[3.5rem] lg:min-h-[4.5rem] flex items-center justify-center">
                  {statsLoading || statsError ? (
                    <div className="relative overflow-hidden w-full">
                      <div className="h-8 sm:h-12 md:h-14 w-20 sm:w-28 md:w-36 mx-auto bg-blue-400/10 rounded-xl flex items-center justify-center">
                        {statsError ? (
                          <span className="text-xs sm:text-sm text-amber-400">...</span>
                        ) : (
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-400/30 to-transparent animate-shimmer"></div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <span className="transition-opacity duration-300">{`${stats.activeUsers.toLocaleString()}+`}</span>
                  )}
                </div>
                <div className="text-white/70 text-base sm:text-lg uppercase tracking-wide min-h-[1.5rem] flex items-center justify-center">
                  {statsLoading || statsError ? (
                    <div className="relative overflow-hidden w-full">
                      <div className="h-4 sm:h-5 w-16 sm:w-20 md:w-24 mx-auto bg-gray-400/10 rounded-lg flex items-center justify-center">
                        {!statsError && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-gray-400/30 to-transparent animate-shimmer"></div>}
                      </div>
                    </div>
                  ) : (
                    <span className="transition-opacity duration-300">
                      <span className="hidden sm:inline">Active Users</span>
                      <span className="sm:hidden">Users</span>
                    </span>
                  )}
                </div>
              </div>
              <div className="text-center">
                <div className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-purple-400 mb-1 sm:mb-2 min-h-[2rem] sm:min-h-[3rem] md:min-h-[3.5rem] lg:min-h-[4.5rem] flex items-center justify-center">
                  {statsLoading || statsError ? (
                    <div className="relative overflow-hidden w-full">
                      <div className="h-8 sm:h-12 md:h-14 w-20 sm:w-28 md:w-36 mx-auto bg-purple-400/10 rounded-xl flex items-center justify-center">
                        {statsError ? (
                          <span className="text-xs sm:text-sm text-amber-400">...</span>
                        ) : (
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-purple-400/30 to-transparent animate-shimmer"></div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <span className="transition-opacity duration-300">{`${stats.partnerCompanies.toLocaleString()}+`}</span>
                  )}
                </div>
                <div className="text-white/70 text-base sm:text-lg uppercase tracking-wide min-h-[1.5rem] flex items-center justify-center">
                  {statsLoading || statsError ? (
                    <div className="relative overflow-hidden w-full">
                      <div className="h-4 sm:h-5 w-16 sm:w-20 md:w-24 mx-auto bg-gray-400/10 rounded-lg flex items-center justify-center">
                        {!statsError && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-gray-400/30 to-transparent animate-shimmer"></div>}
                      </div>
                    </div>
                  ) : (
                    <span className="transition-opacity duration-300">Companies</span>
                  )}
                </div>
              </div>
              <div className="text-center">
                <div className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-teal-400 mb-1 sm:mb-2 min-h-[2rem] sm:min-h-[3rem] md:min-h-[3.5rem] lg:min-h-[4.5rem] flex items-center justify-center">
                  {statsLoading || statsError ? (
                    <div className="relative overflow-hidden w-full">
                      <div className="h-8 sm:h-12 md:h-14 w-20 sm:w-28 md:w-36 mx-auto bg-teal-400/10 rounded-xl flex items-center justify-center">
                        {statsError ? (
                          <span className="text-xs sm:text-sm text-amber-400">...</span>
                        ) : (
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-teal-400/30 to-transparent animate-shimmer"></div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <span className="transition-opacity duration-300">{`${stats.partnerNGOs.toLocaleString()}+`}</span>
                  )}
                </div>
                <div className="text-white/70 text-base sm:text-lg uppercase tracking-wide min-h-[1.5rem] flex items-center justify-center">
                  {statsLoading || statsError ? (
                    <div className="relative overflow-hidden w-full">
                      <div className="h-4 sm:h-5 w-16 sm:w-20 md:w-24 mx-auto bg-gray-400/10 rounded-lg flex items-center justify-center">
                        {!statsError && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-gray-400/30 to-transparent animate-shimmer"></div>}
                      </div>
                    </div>
                  ) : (
                    <span className="transition-opacity duration-300">
                      <span className="hidden sm:inline">Partner NGOs</span>
                      <span className="sm:hidden">NGOs</span>
                    </span>
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
                  <User className="w-5 h-5 mr-3" />
                  Home
                </div>
              </Link>
              {mounted && user ? (
                <Link 
                  href={`/${user.user_type}s/dashboard`}
                  className="group"
                >
                  <button 
                    className="gradient-border-btn shadow-xl text-white transition-all duration-300 h-auto"
                    style={{ 
                      padding: '1.25rem 2.5rem !important', 
                      minWidth: '200px !important',
                      fontSize: '1.125rem !important',
                      fontWeight: '500 !important'
                    }}
                  >
                    <LayoutDashboard className="w-5 h-5 mr-3" />
                    Dashboard
                  </button>
                </Link>
              ) : (
                <a 
                  href="https://navdrishti-portfolio.vercel.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group"
                >
                  <button 
                    className="gradient-border-btn shadow-xl text-white transition-all duration-300 h-auto"
                    style={{ 
                      padding: '1.25rem 2.5rem !important', 
                      minWidth: '200px !important',
                      fontSize: '1.125rem !important',
                      fontWeight: '500 !important'
                    }}
                  >
                    <LayoutDashboard className="w-5 h-5 mr-3" />
                    Portfolio
                  </button>
                </a>
              )}
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
              {mounted && user ? (
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

      {/* Footer */}
      <footer className="w-full bg-gradient-to-b from-gray-900 to-gray-950 border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            {/* Brand Section */}
            <div className="col-span-1 md:col-span-2">
              <img src="/photos/logo.svg" alt="Navadrishti" className="h-20 mb-3" />
              <p className="text-gray-400 text-sm mb-4 max-w-md">
                Empowering communities through collaboration. Connecting individuals, NGOs, and companies to create meaningful social impact across India.
              </p>
              <div className="flex gap-4">
                <a href="#" className="w-10 h-10 rounded-full bg-gray-800 hover:bg-blue-600 flex items-center justify-center transition-colors">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                </a>
                <a href="#" className="w-10 h-10 rounded-full bg-gray-800 hover:bg-blue-400 flex items-center justify-center transition-colors">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/>
                  </svg>
                </a>
                <a href="#" className="w-10 h-10 rounded-full bg-gray-800 hover:bg-pink-600 flex items-center justify-center transition-colors">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z"/>
                  </svg>
                </a>
                <a href="#" className="w-10 h-10 rounded-full bg-gray-800 hover:bg-blue-700 flex items-center justify-center transition-colors">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                  </svg>
                </a>
              </div>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="text-white font-semibold mb-4">Quick Links</h4>
              <ul className="space-y-2">
                <li><a href="/marketplace" className="text-gray-400 hover:text-blue-400 text-sm transition-colors">Marketplace</a></li>
                <li><a href="/service-requests" className="text-gray-400 hover:text-blue-400 text-sm transition-colors">Service Requests</a></li>
                <li><a href="/service-offers" className="text-gray-400 hover:text-blue-400 text-sm transition-colors">Service Offers</a></li>
              </ul>
            </div>

            {/* Resources */}
            <div>
              <h4 className="text-white font-semibold mb-4">Resources</h4>
              <ul className="space-y-2">
                <li><a href="https://navdrishti-portfolio.vercel.app/about.html" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-blue-400 text-sm transition-colors">About Us</a></li>
                <li><a href="mailto:navadrishti@gmail.com?subject=Support%20Request&body=Hello%20Navadrishti%20Team%2C%0A%0AI%20need%20assistance%20with%3A%0A%0A" className="text-gray-400 hover:text-blue-400 text-sm transition-colors">Contact</a></li>
                <li><a href="#" className="text-gray-400 hover:text-blue-400 text-sm transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="text-gray-400 hover:text-blue-400 text-sm transition-colors">Terms of Service</a></li>
              </ul>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="border-t border-gray-800 pt-8">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <p className="text-gray-500 text-sm">
                © {new Date().getFullYear()} Navadrishti. All rights reserved.
              </p>
              <p className="text-gray-400 text-sm">
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
              </p>
            </div>
          </div>
        </div>
      </footer>

    </div>
  )
}

