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
        <section className="relative w-full h-screen min-h-[600px] overflow-hidden">
          {/* Background Container */}
          <div className="absolute inset-0">
            {/* Left Side - Solid Blue Background */}
            <div className="absolute inset-0 bg-udaan-blue" />
            
            {/* Right Side - Image Carousel - Desktop Only */}
            <div className="absolute inset-0 hidden lg:block">
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

            {/* Mobile Layout - Full blue background */}
            <div className="absolute inset-0 lg:hidden bg-udaan-blue" />
          </div>

          {/* Content Container */}
          <div className="relative z-10 h-full">
            <div className="udaan-container px-4 md:px-6 h-full">
              <div className="flex lg:grid lg:grid-cols-2 gap-8 h-full items-center justify-start">
                {/* Left Side Content - Left-aligned on both mobile and desktop */}
                <div className="flex flex-col justify-center space-y-6 animate-fadeIn lg:pr-12 w-full lg:w-auto text-left">
                  <div className="space-y-4">
                    <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-tight max-w-lg lg:max-w-none">
                      Empowering Communities Through Business 
                      <span className="block text-orange-400">Literacy</span>
                    </h1>
                    <p className="text-base sm:text-lg md:text-xl text-white/90 leading-relaxed max-w-md lg:max-w-2xl">
                      We equip individuals with the knowledge and skills to foster economic growth and create sustainable livelihoods in their communities.
                    </p>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row gap-4 items-start">
                    <Dialog open={open} onOpenChange={setOpen}>
                      <DialogTrigger asChild>
                        <Button 
                          size="lg" 
                          className="h-14 text-lg px-8" 
                          variant="udaan-primary"
                          onClick={handleGetStarted}
                        >
                          {user ? 'Go to Dashboard' : 'Get Started'}
                          <ArrowRight className="ml-2 h-5 w-5" />
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
                        <Button size="lg" variant="udaan-outline" className="h-14 text-lg px-8">
                          Sign In
                        </Button>
                      </Link>
                    ) : (
                      <Link href="/service-requests">
                        <Button 
                          size="lg" 
                          variant="udaan-outline" 
                          className="h-14 text-lg px-8"
                        >
                          <HeartHandshake className="mr-2 h-5 w-5" />
                          <span className="font-medium">Find Opportunities</span>
                        </Button>
                      </Link>
                    )}
                  </div>

                  {/* Real Platform Stats */}
                  <div className="grid grid-cols-3 gap-4 pt-8 border-t border-white/20">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-orange-400">
                        {loading ? (
                          <div className="animate-pulse bg-orange-400/20 h-8 w-12 mx-auto rounded"></div>
                        ) : (
                          <span className="animate-fadeIn">{stats.activeUsers || 0}</span>
                        )}
                      </div>
                      <div className="text-sm text-white/70">Active Users</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-orange-400">
                        {loading ? (
                          <div className="animate-pulse bg-orange-400/20 h-8 w-12 mx-auto rounded"></div>
                        ) : (
                          <span className="animate-fadeIn">{stats.partnerNGOs || 0}</span>
                        )}
                      </div>
                      <div className="text-sm text-white/70">Partner NGOs</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-orange-400">
                        {loading ? (
                          <div className="animate-pulse bg-orange-400/20 h-8 w-12 mx-auto rounded"></div>
                        ) : (
                          <span className="animate-fadeIn">{stats.partnerCompanies || 0}</span>
                        )}
                      </div>
                      <div className="text-sm text-white/70">Companies</div>
                    </div>
                  </div>
                </div>

                {/* Right Side - Hidden on smaller screens, carousel shows through */}
                <div className="hidden lg:block">
                  {/* This space is for the carousel which shows through the clip-path */}
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

