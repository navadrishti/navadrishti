"use client"

import Link from "next/link"
import Image from "next/image" 
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Header } from "@/components/header"
import { Building, HeartHandshake, GraduationCap, ShoppingBag, UserCheck, Users, ArrowRight, Briefcase, User, Compass, Globe, Map } from "lucide-react"
import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { useAuth } from "@/lib/auth-context"
import { useRouter } from "next/navigation"

export default function Home() {
  const [open, setOpen] = useState(false)
  const { user } = useAuth()
  const router = useRouter()

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
        {/* Hero Section */}
        <section className="w-full py-12 md:py-24 lg:py-32 bg-udaan-blue text-white">
          <div className="udaan-container px-4 md:px-6">
            <div className="flex flex-col justify-center space-y-4 animate-fadeIn">
              <div className="space-y-2">
                <h1 className="udaan-heading tracking-tighter">
                  Empowering Communities Through Business Literacy
                </h1>
                <p className="udaan-subheading text-white/80 mt-4">
                  We equip individuals with the knowledge and skills to foster economic growth and create sustainable livelihoods in their communities.
                </p>
              </div>
              <div className="flex flex-wrap gap-4 mt-6">
                <Dialog open={open} onOpenChange={setOpen}>
                  <DialogTrigger asChild>
                    <Button 
                      size="lg" 
                      className="h-12" 
                      variant="udaan-primary"
                      onClick={handleGetStarted}
                    >
                      {user ? 'Go to Dashboard' : 'Get Started'}
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
                    <Button size="lg" variant="udaan-outline" className="h-12">Sign In</Button>
                  </Link>
                ) : (
                  <Link href="/service-requests">
                    <Button 
                      size="lg" 
                      variant="udaan-outline" 
                      className="h-12"
                    >
                      <HeartHandshake className="mr-2 h-5 w-5" />
                      <span className="font-medium">Find Opportunities</span>
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="w-full py-12 md:py-16 lg:py-20 bg-udaan-cream">
          <div className="udaan-container px-4 md:px-6">
            <div className="flex flex-col items-center justify-center space-y-4 text-center">
              <div className="space-y-2">
                <h2 className="text-3xl font-bold tracking-tighter text-udaan-navy md:text-4xl">How It Works</h2>
                <p className="max-w-[900px] text-udaan-navy/80 md:text-xl/relaxed">
                  Our platform connects NGOs with skilled individuals and companies to maximize social impact.
                </p>
              </div>
            </div>
            <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 py-8 md:grid-cols-3">
              <div className="flex flex-col items-center space-y-4 text-center bg-white p-6 rounded-lg shadow-sm hover-scale">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-udaan-navy">
                  <Building className="h-8 w-8 text-udaan-white" />
                </div>
                <h3 className="text-xl font-bold text-udaan-navy">NGOs Register</h3>
                <p className="text-udaan-navy/70">
                  NGOs create profiles and list individuals with specific skills required for their projects.
                </p>
                <Link href="/ngos/register" passHref>
                  <Button variant="link" className="font-medium text-udaan-orange">
                    Register Now
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </Link>
              </div>
              <div className="flex flex-col items-center space-y-4 text-center bg-white p-6 rounded-lg shadow-sm hover-scale">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-udaan-blue">
                  <GraduationCap className="h-8 w-8 text-udaan-white" />
                </div>
                <h3 className="text-xl font-bold text-udaan-navy">Browse Training</h3>
                <p className="text-udaan-navy/70">
                  Access free courses, tutorials, and resources to enhance your skills and professional development.
                </p>
                <Link href="/training" passHref>
                  <Button variant="link" className="font-medium text-udaan-orange">
                    Start Learning
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </Link>
              </div>
              <div className="flex flex-col items-center space-y-4 text-center bg-white p-6 rounded-lg shadow-sm hover-scale">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-udaan-orange">
                  <HeartHandshake className="h-8 w-8 text-udaan-white" />
                </div>
                <h3 className="text-xl font-bold text-udaan-navy">Connect & Collaborate</h3>
                <p className="text-udaan-navy/70">
                  Companies and individuals connect with NGOs to support projects and initiatives.
                </p>
                <Link href="/marketplace" passHref>
                  <Button variant="link" className="font-medium text-udaan-orange">
                    Browse Marketplace
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

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

