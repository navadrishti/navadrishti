"use client"

import Link from "next/link"
import Image from "next/image" 
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Header } from "@/components/header"
import { HowItWorks } from "@/components/ui/how-it-works"
import { Building, HeartHandshake, GraduationCap, ShoppingBag, UserCheck, Users, ArrowRight, Briefcase, User, Compass, Globe, Map, Award } from "lucide-react"
import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { useAuth } from "@/lib/auth-context"
import { useRouter } from "next/navigation"
import { HeroCarousel } from "@/components/hero-carousel"
import { useStats } from "@/hooks/use-stats"

export default function Home() {
  const [open, setOpen] = useState(false)
  const { user } = useAuth()
  const router = useRouter()
  const { stats, loading } = useStats()

  // Predefined particle configurations to avoid hydration mismatches
  const particleConfigs = [
    { left: 15, top: 25, delay: 0, duration: 3.5 },
    { left: 85, top: 60, delay: 0.5, duration: 4.2 },
    { left: 45, top: 80, delay: 1, duration: 3.8 },
    { left: 70, top: 15, delay: 1.5, duration: 4.0 },
    { left: 20, top: 90, delay: 2, duration: 3.3 },
    { left: 90, top: 40, delay: 2.5, duration: 4.5 },
    { left: 60, top: 70, delay: 3, duration: 3.7 },
    { left: 35, top: 35, delay: 3.5, duration: 4.1 },
  ]

  // Function to handle get started button click for authenticated users
  const handleGetStarted = () => {
    if (user) {
      // Redirect to appropriate dashboard based on user type
      switch (user.user_type) {
        case 'ngo':
          router.push('/ngos/dashboard')
          break
        case 'company':
          router.push('/companies/dashboard')
          break
        case 'individual':
          router.push('/individuals/dashboard')
          break
        default:
          setOpen(true)
      }
    } else {
      // Open registration dialog for unauthenticated users
      setOpen(true)
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        {/* Hero Section with Diagonal Split */}
        <section className="relative w-full h-screen min-h-[500px] sm:min-h-[600px] md:min-h-[700px] lg:min-h-[600px] overflow-hidden">
          {/* Background Container */}
          <div className="absolute inset-0">
            {/* Left Side - Solid Blue Background */}
            <div className="absolute inset-0 bg-udaan-blue" />
            
            {/* Right Side - Image Carousel - Tablet and Desktop */}
            <div className="absolute inset-0 hidden md:block">
              <HeroCarousel
                images={[
                  {
                    src: "https://images.unsplash.com/photo-1559027615-cd4628902d4a?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1920&q=95",
                    alt: "Community empowerment through business literacy",
                    title: "Empowering Communities",
                    description: "Building sustainable livelihoods through business education"
                  },
                  {
                    src: "https://images.unsplash.com/photo-1544027993-37dbfe43562a?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1920&q=95", 
                    alt: "Skill development and training",
                    title: "Skill Development",
                    description: "Professional training programs for economic growth"
                  },
                  {
                    src: "https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1920&q=95",
                    alt: "Community collaboration and networking",
                    title: "Community Network",
                    description: "Connecting individuals, NGOs, and businesses"
                  },
                  {
                    src: "https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1920&q=95",
                    alt: "Sustainable economic development",
                    title: "Economic Growth",
                    description: "Creating opportunities for sustainable development"
                  },
                  {
                    src: "https://images.unsplash.com/photo-1469571486292-0ba58a3f068b?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1920&q=95",
                    alt: "Educational workshops and training",
                    title: "Education & Training",
                    description: "Comprehensive learning programs for community development"
                  },
                  {
                    src: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1920&q=95",
                    alt: "Women empowerment and leadership",
                    title: "Women Empowerment",
                    description: "Supporting women entrepreneurs and leaders"
                  }
                ]}
                autoPlayInterval={6000}
                showIndicators={true}
                showNavigation={false}
              />
            </div>
            
            {/* Diagonal Divider with Red Line - Responsive */}
            <div className="absolute inset-0 hidden lg:block">
              {/* Diagonal clip path for right side - Desktop only */}
              <div 
                className="absolute inset-0 bg-transparent"
                style={{
                  clipPath: 'polygon(0 0, 65% 0, 45% 100%, 0 100%)'
                }}
              >
                <div className="w-full h-full bg-udaan-blue" />
              </div>
              
              {/* Red diagonal line - Desktop only */}
              <div 
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: 'linear-gradient(135deg, transparent 45%, #ef4444 45%, #ef4444 47%, transparent 47%)'
                }}
              />
            </div>

            {/* Tablet Layout - More conservative diagonal for better text space */}
            <div className="absolute inset-0 hidden md:block lg:hidden">
              <div 
                className="absolute inset-0 bg-transparent"
                style={{
                  clipPath: 'polygon(0 0, 40% 0, 25% 100%, 0 100%)'
                }}
              >
                <div className="w-full h-full bg-udaan-blue" />
              </div>
              
              <div 
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: 'linear-gradient(115deg, transparent 25%, #ef4444 25%, #ef4444 27%, transparent 27%)'
                }}
              />
            </div>

            {/* Mobile Layout - Creative Liquid Container Design */}
            <div className="absolute inset-0 md:hidden">
              {/* Base gradient background */}
              <div className="absolute inset-0 bg-gradient-to-br from-udaan-blue via-blue-600 to-udaan-navy overflow-hidden"></div>
              
              {/* Animated liquid blobs */}
              <div className="absolute inset-0">
                {/* Large floating blob */}
                <div 
                  className="absolute w-96 h-96 bg-gradient-to-r from-orange-400/30 to-orange-500/20 rounded-full blur-3xl animate-float-slow"
                  style={{
                    top: '10%',
                    right: '-20%',
                    animationDelay: '0s'
                  }}
                ></div>
                
                {/* Medium blob */}
                <div 
                  className="absolute w-64 h-64 bg-gradient-to-l from-blue-300/25 to-cyan-400/15 rounded-full blur-2xl animate-float-medium"
                  style={{
                    bottom: '20%',
                    left: '-15%',
                    animationDelay: '2s'
                  }}
                ></div>
                
                {/* Small accent blob */}
                <div 
                  className="absolute w-32 h-32 bg-gradient-to-tr from-orange-300/40 to-yellow-400/25 rounded-full blur-xl animate-float-fast"
                  style={{
                    top: '60%',
                    right: '10%',
                    animationDelay: '1s'
                  }}
                ></div>
                
                {/* Tiny floating elements */}
                <div 
                  className="absolute w-16 h-16 bg-white/10 rounded-full blur-sm animate-float-gentle"
                  style={{
                    top: '30%',
                    left: '20%',
                    animationDelay: '3s'
                  }}
                ></div>
                
                <div 
                  className="absolute w-20 h-20 bg-orange-200/20 rounded-full blur-md animate-float-gentle"
                  style={{
                    bottom: '40%',
                    right: '30%',
                    animationDelay: '4s'
                  }}
                ></div>
              </div>
              
              {/* Animated particles */}
              <div className="absolute inset-0 overflow-hidden">
                {particleConfigs.map((config, i) => (
                  <div
                    key={i}
                    className="absolute w-1 h-1 bg-white/30 rounded-full animate-particle"
                    style={{
                      left: `${config.left}%`,
                      top: `${config.top}%`,
                      animationDelay: `${config.delay}s`,
                      animationDuration: `${config.duration}s`
                    }}
                  ></div>
                ))}
              </div>
            </div>
            
            {/* Infinite liquid wave overlay - Mobile only */}
            <div className="absolute bottom-0 left-0 right-0 h-16 md:hidden pointer-events-none overflow-hidden">
              <div className="absolute bottom-0 w-full h-full animate-wave-flow">
                <svg 
                  className="absolute bottom-0 w-[200%] h-full" 
                  viewBox="0 0 2400 60" 
                  preserveAspectRatio="none"
                >
                  <path 
                    d="M0,40 Q300,10 600,40 T1200,40 Q1500,10 1800,40 T2400,40 L2400,60 L0,60 Z" 
                    fill="url(#infiniteWaveGradient)"
                  />
                  <defs>
                    <linearGradient id="infiniteWaveGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="rgba(244, 123, 32, 0.5)" />
                      <stop offset="25%" stopColor="rgba(59, 130, 246, 0.4)" />
                      <stop offset="50%" stopColor="rgba(244, 123, 32, 0.5)" />
                      <stop offset="75%" stopColor="rgba(59, 130, 246, 0.4)" />
                      <stop offset="100%" stopColor="rgba(244, 123, 32, 0.5)" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </div>
          </div>

          {/* Content Container */}
          <div className="relative z-10 h-full">
            <div className="udaan-container px-4 sm:px-6 md:px-8 lg:px-6 h-full">
              <div className="flex md:grid md:grid-cols-5 lg:grid-cols-2 gap-4 md:gap-6 lg:gap-8 h-full items-center justify-start">
                {/* Left Side Content - Enhanced for mobile liquid design */}
                <div className="flex flex-col justify-center space-y-4 sm:space-y-5 md:space-y-6 animate-fadeIn md:pr-4 lg:pr-12 w-full md:col-span-2 lg:col-span-1 text-left relative z-10">
                  <div className="space-y-3 sm:space-y-4 md:backdrop-blur-none backdrop-blur-sm md:bg-transparent bg-black/10 md:p-0 p-4 md:rounded-none rounded-2xl">
                    <h1 className="text-2xl xs:text-3xl sm:text-4xl md:text-3xl lg:text-5xl xl:text-6xl font-bold tracking-tight text-white leading-tight max-w-full sm:max-w-lg md:max-w-xs lg:max-w-lg xl:max-w-none drop-shadow-lg">
                      Empowering Communities Through Business 
                      <span className="block text-orange-400 animate-pulse">Literacy</span>
                    </h1>
                    <p className="text-sm xs:text-base sm:text-lg md:text-sm lg:text-lg xl:text-xl text-white/95 leading-relaxed max-w-full sm:max-w-md md:max-w-xs lg:max-w-md xl:max-w-2xl drop-shadow-md">
                      We equip individuals with the knowledge and skills to foster economic growth and create sustainable livelihoods in their communities.
                    </p>
                  </div>
                  
                  <div className="flex flex-col md:flex-row gap-3 sm:gap-4 items-start">
                    <Dialog open={open} onOpenChange={setOpen}>
                      <DialogTrigger asChild>
                        <Button 
                          size="lg" 
                          className="group h-12 xs:h-13 sm:h-14 md:h-12 lg:h-14 text-base xs:text-lg sm:text-lg md:text-base lg:text-lg px-6 xs:px-7 sm:px-8 md:px-6 lg:px-8 w-full md:w-auto md:transform-none transform hover:scale-105 transition-all duration-300 shadow-lg md:shadow-none hover:shadow-xl" 
                          variant="udaan-primary"
                          onClick={handleGetStarted}
                        >
                          {user ? 'Go to Dashboard' : 'Get Started'}
                          <ArrowRight className="ml-2 h-4 xs:h-5 sm:h-5 md:h-4 lg:h-5 w-4 xs:w-5 sm:w-5 md:w-4 lg:w-5 transition-transform group-hover:translate-x-1" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                          <DialogTitle>Choose Registration Type</DialogTitle>
                          <DialogDescription>
                            Select how you would like to join our platform
                          </DialogDescription>
                        </DialogHeader>
                        <div className="grid grid-cols-1 gap-4 py-4">
                          <Link href="/ngos/register" passHref onClick={() => setOpen(false)}>
                            <Button className="w-full justify-start" variant="outline">
                              <Building className="mr-2 h-5 w-5" />
                              <div className="flex flex-col items-start">
                                <span>Register as NGO</span>
                                <span className="text-xs text-gray-500">For non-profit organizations</span>
                              </div>
                            </Button>
                          </Link>
                          <Link href="/companies/register" passHref onClick={() => setOpen(false)}>
                            <Button className="w-full justify-start" variant="outline">
                              <Briefcase className="mr-2 h-5 w-5" />
                              <div className="flex flex-col items-start">
                                <span>Register as Company</span>
                                <span className="text-xs text-gray-500">For businesses looking to hire or support</span>
                              </div>
                            </Button>
                          </Link>
                          <Link href="/individuals/register" passHref onClick={() => setOpen(false)}>
                            <Button className="w-full justify-start" variant="outline">
                              <User className="mr-2 h-5 w-5" />
                              <div className="flex flex-col items-start">
                                <span>Register as Individual</span>
                                <span className="text-xs text-gray-500">For professionals seeking opportunities</span>
                              </div>
                            </Button>
                          </Link>
                        </div>
                      </DialogContent>
                    </Dialog>
                    
                    {!user ? (
                      <Link href="/login">
                        <Button size="lg" variant="udaan-outline" className="h-12 xs:h-13 sm:h-14 md:h-12 lg:h-14 text-base xs:text-lg sm:text-lg md:text-base lg:text-lg px-6 xs:px-7 sm:px-8 md:px-6 lg:px-8 w-full md:w-auto">
                          Sign In
                        </Button>
                      </Link>
                    ) : (
                      <Link href="/service-requests">
                        <Button 
                          size="lg" 
                          variant="udaan-outline" 
                          className="h-12 xs:h-13 sm:h-14 md:h-12 lg:h-14 text-base xs:text-lg sm:text-lg md:text-base lg:text-lg px-6 xs:px-7 sm:px-8 md:px-6 lg:px-8 w-full md:w-auto"
                        >
                          <HeartHandshake className="mr-2 h-4 xs:h-5 sm:h-5 md:h-4 lg:h-5 w-4 xs:w-5 sm:w-5 md:w-4 lg:w-5" />
                          <span className="font-medium">Find Opportunities</span>
                        </Button>
                      </Link>
                    )}
                  </div>

                  {/* Real Platform Stats */}
                  <div className="grid grid-cols-3 gap-2 xs:gap-3 sm:gap-4 pt-6 sm:pt-8 border-t border-white/20">
                    <div className="text-center group">
                      <div className="text-lg xs:text-xl sm:text-2xl font-bold text-orange-400 transition-all duration-300 group-hover:scale-110 md:group-hover:scale-100">
                        {loading ? (
                          <div className="animate-pulse bg-orange-400/20 h-6 xs:h-7 sm:h-8 w-8 xs:w-10 sm:w-12 mx-auto rounded"></div>
                        ) : (
                          <span className="animate-fadeIn md:animate-none animate-pulse">{stats.activeUsers || 0}</span>
                        )}
                      </div>
                      <div className="text-xs xs:text-sm text-white/70">Active Users</div>
                    </div>
                    <div className="text-center group">
                      <div className="text-lg xs:text-xl sm:text-2xl font-bold text-orange-400 transition-all duration-300 group-hover:scale-110 md:group-hover:scale-100">
                        {loading ? (
                          <div className="animate-pulse bg-orange-400/20 h-6 xs:h-7 sm:h-8 w-8 xs:w-10 sm:w-12 mx-auto rounded"></div>
                        ) : (
                          <span className="animate-fadeIn md:animate-none animate-pulse">{stats.partnerNGOs || 0}</span>
                        )}
                      </div>
                      <div className="text-xs xs:text-sm text-white/70">Partner NGOs</div>
                    </div>
                    <div className="text-center group">
                      <div className="text-lg xs:text-xl sm:text-2xl font-bold text-orange-400 transition-all duration-300 group-hover:scale-110 md:group-hover:scale-100">
                        {loading ? (
                          <div className="animate-pulse bg-orange-400/20 h-6 xs:h-7 sm:h-8 w-8 xs:w-10 sm:w-12 mx-auto rounded"></div>
                        ) : (
                          <span className="animate-fadeIn md:animate-none animate-pulse">{stats.partnerCompanies || 0}</span>
                        )}
                      </div>
                      <div className="text-xs xs:text-sm text-white/70">Companies</div>
                    </div>
                  </div>
                </div>

                {/* Right Side - Spacer for tablets, hidden on mobile */}
                <div className="hidden md:block lg:block md:col-span-3 lg:col-span-1">
                  {/* This space allows proper carousel display and prevents text overlap */}
                </div>
              </div>
            </div>
          </div>

        </section>

        {/* Enhanced How It Works Section */}
        <HowItWorks />

        {/* CTA Section */}
        <section className="w-full py-12 md:py-24 lg:py-32 bg-udaan-navy text-white">
          <div className="udaan-container px-4 md:px-6">
            <div className="flex flex-col items-center justify-center space-y-4 text-center">
              <div className="space-y-2">
                <h2 className="text-3xl font-bold tracking-tighter md:text-4xl">Ready to Get Started?</h2>
                <p className="max-w-[900px] text-white/80 md:text-xl/relaxed">
                  Join our platform today and be part of a growing community dedicated to making a positive impact.
                </p>
              </div>
              <div className="flex flex-wrap gap-4 mt-6">
                {!user ? (
                  <>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button size="lg" variant="udaan-primary" className="h-12">Get Started</Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                          <DialogTitle>Choose Registration Type</DialogTitle>
                          <DialogDescription>
                            Select how you would like to join our platform
                          </DialogDescription>
                        </DialogHeader>
                        <div className="grid grid-cols-1 gap-4 py-4">
                          <Link href="/ngos/register" passHref>
                            <Button className="w-full justify-start" variant="outline">
                              <Building className="mr-2 h-5 w-5" />
                              <div className="flex flex-col items-start">
                                <span>Register as NGO</span>
                                <span className="text-xs text-gray-500">For non-profit organizations</span>
                              </div>
                            </Button>
                          </Link>
                          <Link href="/companies/register" passHref>
                            <Button className="w-full justify-start" variant="outline">
                              <Briefcase className="mr-2 h-5 w-5" />
                              <div className="flex flex-col items-start">
                                <span>Register as Company</span>
                                <span className="text-xs text-gray-500">For businesses looking to hire or support</span>
                              </div>
                            </Button>
                          </Link>
                          <Link href="/individuals/register" passHref>
                            <Button className="w-full justify-start" variant="outline">
                              <User className="mr-2 h-5 w-5" />
                              <div className="flex flex-col items-start">
                                <span>Register as Individual</span>
                                <span className="text-xs text-gray-500">For professionals seeking opportunities</span>
                              </div>
                            </Button>
                          </Link>
                        </div>
                      </DialogContent>
                    </Dialog>
                    <Link href="/login">
                      <Button size="lg" variant="udaan-navy-outline" className="h-12">Sign In</Button>
                    </Link>
                  </>
                ) : (
                  <>
                    <Link href={`/${user.user_type}s/dashboard`}>
                      <Button size="lg" variant="udaan-primary" className="h-12">Go to Dashboard</Button>
                    </Link>
                    <Link href="/marketplace">
                      <Button size="lg" variant="udaan-navy-outline" className="h-12">Browse Marketplace</Button>
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>
      
      {/* Footer */}
      <footer className="w-full border-t bg-udaan-cream py-6 md:py-12">
        <div className="udaan-container px-4 md:px-6">
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-4">
              <Link href="/" className="flex items-center gap-2 font-bold text-xl">
                <HeartHandshake className="h-6 w-6 text-udaan-orange" />
                <span className="text-udaan-navy">Navdrishti</span>
              </Link>
              <p className="text-sm text-udaan-navy/70">
                Connecting NGOs, skilled individuals, and companies to maximize social impact.
              </p>
            </div>
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-udaan-navy">Platform</h3>
              <ul className="space-y-2 text-sm">
                <li><Link href="/ngos" className="text-udaan-navy/70 hover:text-udaan-orange">NGOs</Link></li>
                <li><Link href="/skills/verify" className="text-udaan-navy/70 hover:text-udaan-orange">Skills Verification</Link></li>
                <li><Link href="/marketplace" className="text-udaan-navy/70 hover:text-udaan-orange">Resource Marketplace</Link></li>
                <li><Link href="/training" className="text-udaan-navy/70 hover:text-udaan-orange">Training & Learning</Link></li>
              </ul>
            </div>
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-udaan-navy">Resources</h3>
              <ul className="space-y-2 text-sm">
                <li><Link href="#" className="text-udaan-navy/70 hover:text-udaan-orange">Help Center</Link></li>
                <li><Link href="#" className="text-udaan-navy/70 hover:text-udaan-orange">Blog</Link></li>
                <li><Link href="#" className="text-udaan-navy/70 hover:text-udaan-orange">FAQs</Link></li>
                <li><Link href="#" className="text-udaan-navy/70 hover:text-udaan-orange">Contact Us</Link></li>
              </ul>
            </div>
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-udaan-navy">Legal</h3>
              <ul className="space-y-2 text-sm">
                <li><Link href="#" className="text-udaan-navy/70 hover:text-udaan-orange">Privacy Policy</Link></li>
                <li><Link href="#" className="text-udaan-navy/70 hover:text-udaan-orange">Terms of Service</Link></li>
                <li><Link href="#" className="text-udaan-navy/70 hover:text-udaan-orange">Code of Conduct</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-8 border-t border-udaan-navy/10 pt-6 text-center text-sm text-udaan-navy/70">
            <p>&copy; {new Date().getFullYear()} Navdrishti. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

