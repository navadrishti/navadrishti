"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { smoothNavigate } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription, SheetClose } from "@/components/ui/sheet"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Award, Bell, Menu, Search, ShoppingBag, ShoppingCart, X, GraduationCap, Briefcase, Building, LogIn, MessageSquare } from "lucide-react"
import { useCart } from "@/lib/cart-context"
import { VerificationBadge } from "@/components/verification-badge"

interface ProfileSearchResult {
  id: number;
  name: string;
  email: string;
  user_type: 'individual' | 'ngo' | 'company';
  profile_image?: string;
  verification_status?: string;
  location?: string;
}

export function Header() {
  const { user, logout, refreshUser } = useAuth()
  const { getCartItemCount } = useCart()
  const router = useRouter()
  const cartItemCount = getCartItemCount()
  const [mounted, setMounted] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ProfileSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [isSearchExpanded, setIsSearchExpanded] = useState(false)
  const [showAllResults, setShowAllResults] = useState(false)
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const dropdownTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => { setMounted(true) }, [])

  const handleDropdownEnter = (dropdown: string) => {
    if (dropdownTimeoutRef.current) clearTimeout(dropdownTimeoutRef.current)
    setOpenDropdown(dropdown)
  }

  const handleDropdownLeave = () => {
    dropdownTimeoutRef.current = setTimeout(() => setOpenDropdown(null), 150)
  }

  const handleDropdownStay = () => {
    if (dropdownTimeoutRef.current) clearTimeout(dropdownTimeoutRef.current)
  }
  
  const searchProfiles = async (query: string) => {
    if (!query.trim()) { setSearchResults([]); return }

    setIsSearching(true)
    try {
      const res = await fetch(`/api/search/profiles?q=${encodeURIComponent(query.trim())}&limit=8`)
      const data = await res.json()
      setSearchResults(res.ok ? data.profiles || [] : [])
    } catch (err) {
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    setShowResults(true)
    
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => searchProfiles(value), 150)
  }

  const handleProfileSelect = (profile: ProfileSearchResult) => {
    setSearchQuery('')
    setSearchResults([])
    setShowResults(false)
    setShowAllResults(false)
    router.push(`/profile/${profile.id}`)
  }

  const clearSearch = () => {
    setSearchQuery('')
    setSearchResults([])
    setShowResults(false)
    setShowAllResults(false)
  }

  const getUserTypeIcon = (userType: string) => {
    const icons = { individual: '👤', ngo: '🏢', company: '🏭' }
    return icons[userType as keyof typeof icons] || '👤'
  }
  
  const handleLogout = async () => {
    logout()
    await smoothNavigate(router, '/home', { delay: 100 })
  }

  const getInitials = (name: string) => {
    if (!name) return "U"
    const names = name.split(' ')
    if (names.length === 1) return names[0].charAt(0).toUpperCase()
    return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase()
  }
  
  // Determine where to redirect based on user type
  const getDashboardLink = () => {
    if (!user) return '/'
    
    switch (user.user_type) {
      case 'ngo':
        return '/ngos/dashboard'
      case 'company':
        return '/companies/dashboard'
      case 'individual':
        return '/individuals/dashboard'
      default:
        return '/'
    }
  }
  
  // Check if the user is an NGO
  const isNgo = user?.user_type === 'ngo'
  
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-udaan-navy text-white">
      <div className="udaan-container flex h-16 items-center px-4 md:px-6">
        <Link href="/home" className="flex items-center font-bold text-xl">
          <img src="/photos/logo.svg" alt="Navadrishti" className="h-36 w-36" />
        </Link>
        <div className="hidden md:flex md:flex-1 md:items-center md:justify-end md:gap-4 lg:gap-6">
          <nav className="flex items-center gap-1 lg:gap-2">
            {mounted && (
              <>
            {/* Company Navigation */}
            {user?.user_type === 'company' && (
              <>
                {/* CSR Hub Dropdown */}
                <div 
                  className="relative"
                  onMouseEnter={() => handleDropdownEnter('csr-hub')}
                  onMouseLeave={handleDropdownLeave}
                >
                  <button className="px-3 py-2 text-sm font-medium text-white hover:text-udaan-orange transition-colors flex items-center gap-1">
                    CSR Hub
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {openDropdown === 'csr-hub' && (
                    <div 
                      className="absolute top-full left-0 mt-1 w-56 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-50"
                      onMouseEnter={handleDropdownStay}
                      onMouseLeave={handleDropdownLeave}
                    >
                      <Link href="/companies/csr-agent" className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gradient-to-r hover:from-orange-50 hover:to-pink-50 hover:text-udaan-orange transition-colors">
                        <div>
                          <div className="font-medium">AI CSR Agent</div>
                          <div className="text-xs text-gray-500">Create campaigns</div>
                        </div>
                      </Link>
                      <Link href="/companies/csr-budget" className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gradient-to-r hover:from-orange-50 hover:to-pink-50 hover:text-udaan-orange transition-colors">
                        <div>
                          <div className="font-medium">Budget Planner</div>
                          <div className="text-xs text-gray-500">Manage CSR budget</div>
                        </div>
                      </Link>
                      <Link href="/companies/impact-reports" className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gradient-to-r hover:from-orange-50 hover:to-pink-50 hover:text-udaan-orange transition-colors">
                        <div>
                          <div className="font-medium">Impact Reports</div>
                          <div className="text-xs text-gray-500">Generate reports</div>
                        </div>
                      </Link>
                      <Link href="/csr-campaigns" className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gradient-to-r hover:from-orange-50 hover:to-pink-50 hover:text-udaan-orange transition-colors">
                        <div>
                          <div className="font-medium">Browse NGO Partners</div>
                          <div className="text-xs text-gray-500">Find partners</div>
                        </div>
                      </Link>
                    </div>
                  )}
                </div>

                {/* Services Dropdown */}
                <div 
                  className="relative"
                  onMouseEnter={() => handleDropdownEnter('services-company')}
                  onMouseLeave={handleDropdownLeave}
                >
                  <button className="px-3 py-2 text-sm font-medium text-white hover:text-udaan-orange transition-colors flex items-center gap-1">
                    Services
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {openDropdown === 'services-company' && (
                    <div 
                      className="absolute top-full left-0 mt-1 w-56 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-50"
                      onMouseEnter={handleDropdownStay}
                      onMouseLeave={handleDropdownLeave}
                    >
                      <Link href="/service-requests" className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gradient-to-r hover:from-orange-50 hover:to-pink-50 hover:text-udaan-orange transition-colors">
                        <div>
                          <div className="font-medium">Service Requests</div>
                          <div className="text-xs text-gray-500">Volunteer opportunities</div>
                        </div>
                      </Link>
                      <Link href="/service-offers" className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gradient-to-r hover:from-orange-50 hover:to-pink-50 hover:text-udaan-orange transition-colors">
                        <div>
                          <div className="font-medium">Service Offers</div>
                          <div className="text-xs text-gray-500">Hire NGO services</div>
                        </div>
                      </Link>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* NGO Navigation */}
            {user?.user_type === 'ngo' && (
              <>
                {/* AI Tools Dropdown */}
                <div 
                  className="relative"
                  onMouseEnter={() => handleDropdownEnter('ai-tools')}
                  onMouseLeave={handleDropdownLeave}
                >
                  <button className="px-3 py-2 text-sm font-medium text-white hover:text-udaan-orange transition-colors flex items-center gap-1">
                    AI Tools
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {openDropdown === 'ai-tools' && (
                    <div 
                      className="absolute top-full left-0 mt-1 w-56 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-50"
                      onMouseEnter={handleDropdownStay}
                      onMouseLeave={handleDropdownLeave}
                    >
                      <Link href="/ngos/ai-assistant" className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gradient-to-r hover:from-orange-50 hover:to-pink-50 hover:text-udaan-orange transition-colors">
                        <div>
                          <div className="font-medium">Proposal Generator</div>
                          <div className="text-xs text-gray-500">AI-powered proposals</div>
                        </div>
                      </Link>
                      <Link href="/ngos/ai-assistant?tab=documentation" className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gradient-to-r hover:from-orange-50 hover:to-pink-50 hover:text-udaan-orange transition-colors">
                        <div>
                          <div className="font-medium">Documentation Helper</div>
                          <div className="text-xs text-gray-500">Create documents</div>
                        </div>
                      </Link>
                      <Link href="/ngos/ai-assistant?tab=outreach" className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gradient-to-r hover:from-orange-50 hover:to-pink-50 hover:text-udaan-orange transition-colors">
                        <div>
                          <div className="font-medium">Outreach Creator</div>
                          <div className="text-xs text-gray-500">Generate emails</div>
                        </div>
                      </Link>
                    </div>
                  )}
                </div>

                {/* CSR & Funding Dropdown */}
                <div 
                  className="relative"
                  onMouseEnter={() => handleDropdownEnter('csr-funding')}
                  onMouseLeave={handleDropdownLeave}
                >
                  <button className="px-3 py-2 text-sm font-medium text-white hover:text-udaan-orange transition-colors flex items-center gap-1">
                    CSR & Funding
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {openDropdown === 'csr-funding' && (
                    <div 
                      className="absolute top-full left-0 mt-1 w-56 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-50"
                      onMouseEnter={handleDropdownStay}
                      onMouseLeave={handleDropdownLeave}
                    >
                      <Link href="/csr-campaigns" className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gradient-to-r hover:from-orange-50 hover:to-pink-50 hover:text-udaan-orange transition-colors">
                        <div>
                          <div className="font-medium">Browse CSR Campaigns</div>
                          <div className="text-xs text-gray-500">Apply to campaigns</div>
                        </div>
                      </Link>
                      <Link href="/ngos/campaign-updates" className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gradient-to-r hover:from-orange-50 hover:to-pink-50 hover:text-udaan-orange transition-colors">
                        <div>
                          <div className="font-medium">Campaign Updates</div>
                          <div className="text-xs text-gray-500">Report progress</div>
                        </div>
                      </Link>
                      <Link href="/marketplace/fundraising" className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gradient-to-r hover:from-orange-50 hover:to-pink-50 hover:text-udaan-orange transition-colors">
                        <div>
                          <div className="font-medium">Fundraising Campaigns</div>
                          <div className="text-xs text-gray-500">Create fundraisers</div>
                        </div>
                      </Link>
                    </div>
                  )}
                </div>

                {/* Services Dropdown */}
                <div 
                  className="relative"
                  onMouseEnter={() => handleDropdownEnter('services-ngo')}
                  onMouseLeave={handleDropdownLeave}
                >
                  <button className="px-3 py-2 text-sm font-medium text-white hover:text-udaan-orange transition-colors flex items-center gap-1">
                    Services
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {openDropdown === 'services-ngo' && (
                    <div 
                      className="absolute top-full left-0 mt-1 w-56 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-50"
                      onMouseEnter={handleDropdownStay}
                      onMouseLeave={handleDropdownLeave}
                    >
                      <Link href="/service-offers" className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gradient-to-r hover:from-orange-50 hover:to-pink-50 hover:text-udaan-orange transition-colors">
                        <div>
                          <div className="font-medium">My Service Offers</div>
                          <div className="text-xs text-gray-500">Manage offers</div>
                        </div>
                      </Link>
                      <Link href="/service-requests" className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gradient-to-r hover:from-orange-50 hover:to-pink-50 hover:text-udaan-orange transition-colors">
                        <div>
                          <div className="font-medium">My Service Requests</div>
                          <div className="text-xs text-gray-500">Manage requests</div>
                        </div>
                      </Link>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Individual Navigation */}
            {user?.user_type === 'individual' && (
              <>
                {/* Opportunities Dropdown */}
                <div 
                  className="relative"
                  onMouseEnter={() => handleDropdownEnter('opportunities')}
                  onMouseLeave={handleDropdownLeave}
                >
                  <button className="px-3 py-2 text-sm font-medium text-white hover:text-udaan-orange transition-colors flex items-center gap-1">
                    Opportunities
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {openDropdown === 'opportunities' && (
                    <div 
                      className="absolute top-full left-0 mt-1 w-56 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-50"
                      onMouseEnter={handleDropdownStay}
                      onMouseLeave={handleDropdownLeave}
                    >
                      <Link href="/service-requests" className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gradient-to-r hover:from-orange-50 hover:to-pink-50 hover:text-udaan-orange transition-colors">
                        <div>
                          <div className="font-medium">Service Requests</div>
                          <div className="text-xs text-gray-500">Volunteer opportunities</div>
                        </div>
                      </Link>
                      <Link href="/service-offers" className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gradient-to-r hover:from-orange-50 hover:to-pink-50 hover:text-udaan-orange transition-colors">
                        <div>
                          <div className="font-medium">Service Offers</div>
                          <div className="text-xs text-gray-500">Job opportunities</div>
                        </div>
                      </Link>
                      <Link href="/csr-campaigns" className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gradient-to-r hover:from-orange-50 hover:to-pink-50 hover:text-udaan-orange transition-colors">
                        <div>
                          <div className="font-medium">CSR Campaigns</div>
                          <div className="text-xs text-gray-500">Corporate volunteering</div>
                        </div>
                      </Link>
                    </div>
                  )}
                </div>

                {/* My Impact Dropdown */}
                <div 
                  className="relative"
                  onMouseEnter={() => handleDropdownEnter('my-impact')}
                  onMouseLeave={handleDropdownLeave}
                >
                  <button className="px-3 py-2 text-sm font-medium text-white hover:text-udaan-orange transition-colors flex items-center gap-1">
                    My Impact
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {openDropdown === 'my-impact' && (
                    <div 
                      className="absolute top-full left-0 mt-1 w-56 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-50"
                      onMouseEnter={handleDropdownStay}
                      onMouseLeave={handleDropdownLeave}
                    >
                      <Link href={`/profile/${user.id}`} className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gradient-to-r hover:from-orange-50 hover:to-pink-50 hover:text-udaan-orange transition-colors">
                        <div>
                          <div className="font-medium">Impact Profile</div>
                          <div className="text-xs text-gray-500">Your social portfolio</div>
                        </div>
                      </Link>
                      <Link href={`/profile/${user.id}?tab=history`} className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gradient-to-r hover:from-orange-50 hover:to-pink-50 hover:text-udaan-orange transition-colors">
                        <div>
                          <div className="font-medium">Recent Activity</div>
                          <div className="text-xs text-gray-500">Track your activity</div>
                        </div>
                      </Link>
                      <Link href={`/profile/${user.id}?tab=achievements`} className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gradient-to-r hover:from-orange-50 hover:to-pink-50 hover:text-udaan-orange transition-colors">
                        <div>
                          <div className="font-medium">Achievements</div>
                          <div className="text-xs text-gray-500">Badges & milestones</div>
                        </div>
                      </Link>
                      <Link href={`/profile/${user.id}?tab=impact`} className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gradient-to-r hover:from-orange-50 hover:to-pink-50 hover:text-udaan-orange transition-colors">
                        <div>
                          <div className="font-medium">Impact Metrics</div>
                          <div className="text-xs text-gray-500">View your impact</div>
                        </div>
                      </Link>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Non-logged in users - show simple links */}
            {!user && (
              <>
                <Link href="/service-requests" className="px-3 py-2 text-sm font-medium text-white hover:text-udaan-orange transition-colors">
                  Service Requests
                </Link>
                <Link href="/service-offers" className="px-3 py-2 text-sm font-medium text-white hover:text-udaan-orange transition-colors">
                  Service Offers
                </Link>
              </>
            )}

            {/* Marketplace Dropdown - For all users */}
            <div 
              className="relative"
              onMouseEnter={() => handleDropdownEnter('marketplace')}
              onMouseLeave={handleDropdownLeave}
            >
              <button 
                onClick={(e) => {
                  e.preventDefault();
                  router.push('/marketplace');
                }}
                className="px-3 py-2 text-sm font-medium text-white hover:text-udaan-orange transition-colors flex items-center gap-1"
              >
                Marketplace
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {openDropdown === 'marketplace' && (
                <div 
                  className="absolute top-full left-0 mt-1 w-56 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-50"
                  onMouseEnter={handleDropdownStay}
                  onMouseLeave={handleDropdownLeave}
                >
                  <Link href="/marketplace" className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gradient-to-r hover:from-orange-50 hover:to-pink-50 hover:text-udaan-orange transition-colors">
                    <div>
                      <div className="font-medium">Browse Products</div>
                      <div className="text-xs text-gray-500">Shop community items</div>
                    </div>
                  </Link>
                  {user?.user_type === 'ngo' && (
                    <Link href="/marketplace/fundraising" className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gradient-to-r hover:from-orange-50 hover:to-pink-50 hover:text-udaan-orange transition-colors">
                      <div>
                        <div className="font-medium">Fundraising</div>
                        <div className="text-xs text-gray-500">Create campaigns</div>
                      </div>
                    </Link>
                  )}
                  {user && (
                    <>
                      <Link href={`${getDashboardLink()}?tab=marketplace&subtab=selling`} className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gradient-to-r hover:from-orange-50 hover:to-pink-50 hover:text-udaan-orange transition-colors">
                        <div>
                          <div className="font-medium">My Listings</div>
                          <div className="text-xs text-gray-500">Manage your items</div>
                        </div>
                      </Link>
                      <Link href="/orders" className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gradient-to-r hover:from-orange-50 hover:to-pink-50 hover:text-udaan-orange transition-colors">
                        <div>
                          <div className="font-medium">My Orders</div>
                          <div className="text-xs text-gray-500">Track purchases</div>
                        </div>
                      </Link>
                    </>
                  )}
                </div>
              )}
            </div>
              </>
            )}
          </nav>
          <div className="relative hidden md:block">
            <div className="relative flex items-center">
              {!isSearchExpanded ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative rounded-lg !p-2 !w-10 !h-10 border-2 border-white hover:bg-white/10"
                  onClick={() => setIsSearchExpanded(true)}
                >
                  <Search className="h-5 w-5 text-white" />
                </Button>
              ) : (
                <div className="relative flex items-center z-50">
                  <div className="relative border-2 border-gray-300 rounded-lg overflow-hidden">
                    <div className="relative bg-white">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-600 pointer-events-none z-10" />
                      <Input
                        type="text"
                        placeholder="Search people, NGOs, companies..."
                        className="w-64 md:w-80 lg:w-96 bg-white border-0 pl-8 pr-12 text-black placeholder:text-gray-500 focus:ring-0 relative z-20"
                        value={searchQuery}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        onFocus={() => {
                          setIsInputFocused(true)
                          setShowResults(true)
                        }}
                        onBlur={(e) => {
                          // Don't hide immediately - check if clicking on dropdown
                          setTimeout(() => {
                            // Only hide if not clicking on dropdown and no search query
                            const relatedTarget = e.relatedTarget as HTMLElement
                            const isClickingDropdown = relatedTarget && (
                              relatedTarget.closest('[data-search-dropdown]') ||
                              relatedTarget.getAttribute('data-search-dropdown') !== null
                            )
                            
                            if (!isClickingDropdown) {
                              setIsInputFocused(false)
                              if (!searchQuery.trim()) {
                                setShowResults(false)
                                setShowAllResults(false)
                              }
                            }
                          }, 150)
                        }}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0 text-gray-600 hover:text-black z-30"
                        onClick={() => {
                          setSearchQuery('')
                          setSearchResults([])
                          setShowAllResults(false)
                          setIsSearchExpanded(false)
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {/* Search Results Popover */}
            {showResults && isSearchExpanded && (
              <div 
                className="absolute top-full left-0 mt-1 z-50" 
                data-search-dropdown="true"
                onMouseDown={(e) => e.preventDefault()} // Prevent input blur when clicking dropdown
              >
                <div className="w-64 md:w-80 lg:w-96 p-0 border-2 border-gray-300 rounded-lg shadow-lg overflow-hidden">
                    <div className="bg-white">
                      <Command>
                        <CommandList className={showAllResults ? "max-h-80 overflow-y-auto" : ""}>
                          {isSearching ? (
                            <div className="p-4 text-center text-muted-foreground">
                              <div className="flex items-center justify-center gap-2">
                                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                Searching...
                              </div>
                            </div>
                          ) : searchQuery.length >= 1 && searchResults.length > 0 ? (
                            <>
                              <CommandGroup heading={searchResults.length > 3 && !showAllResults ? `Top 3 of ${searchResults.length} profiles` : `Found ${searchResults.length} profile${searchResults.length > 1 ? 's' : ''}`}>
                                {(showAllResults ? searchResults : searchResults.slice(0, 3)).map((profile) => (
                                  <CommandItem
                                    key={profile.id}
                                    value={profile.name}
                                    onSelect={() => handleProfileSelect(profile)}
                                    className="cursor-pointer p-4 hover:bg-gray-50 transition-colors"
                                  >
                                    <div className="flex items-center gap-3 w-full">
                                      <Avatar className="h-10 w-10 flex-shrink-0">
                                        {profile.profile_image && (
                                          <AvatarImage src={profile.profile_image} alt={profile.name} />
                                        )}
                                        <AvatarFallback className="text-xs bg-gradient-to-br from-blue-400 to-indigo-500 text-white font-semibold">
                                          {getInitials(profile.name)}
                                        </AvatarFallback>
                                      </Avatar>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                          <span className="font-medium truncate">{profile.name}</span>
                                          {profile.verification_status === 'verified' && (
                                            <VerificationBadge status="verified" size="sm" showText={false} />
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2 mt-1">
                                          <Badge variant="secondary" className="text-xs capitalize text-gray-800 border-gray-300 rounded-full px-2 py-1">
                                            {profile.user_type}
                                          </Badge>
                                          {profile.location && (
                                            <span className="text-xs text-muted-foreground truncate">{profile.location}</span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                              {searchResults.length > 3 && (
                                <div className="border-t border-gray-200 p-2">
                                  {!showAllResults ? (
                                    <Button 
                                      variant="ghost" 
                                      className="w-full text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                                      onClick={() => setShowAllResults(true)}
                                    >
                                      View all {searchResults.length} profiles
                                    </Button>
                                  ) : (
                                    <Button 
                                      variant="ghost" 
                                      className="w-full text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-50"
                                      onClick={() => setShowAllResults(false)}
                                    >
                                      Show less
                                    </Button>
                                  )}
                                </div>
                              )}
                            </>
                          ) : searchQuery.length >= 1 ? (
                            <div className="p-4 text-center">
                              <p className="text-muted-foreground text-sm">No profiles found for "{searchQuery}"</p>
                              <p className="text-xs text-muted-foreground mt-1">Try searching for names, organizations, or locations</p>
                            </div>
                          ) : (
                            <div className="p-4 text-center text-muted-foreground">
                              <p className="text-sm">Type to search profiles</p>
                              <p className="text-xs mt-1">Search for people, NGOs, or companies</p>
                            </div>
                          )}
                        </CommandList>
                      </Command>
                    </div>
                  </div>
                </div>
            )}
          </div>          
          {mounted && user ? (
            <>
              {/* Cart Icon with Badge - Only for logged in users */}
              <Button 
                variant="ghost" 
                size="icon" 
                className="relative rounded-lg !p-2 !w-10 !h-10 border-2 border-white hover:bg-white/10"
                onClick={() => router.push('/cart')}
              >
                <ShoppingCart className="h-5 w-5 text-white" />
                {cartItemCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-udaan-orange text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-medium">
                    {cartItemCount > 99 ? '99+' : cartItemCount}
                  </span>
                )}
              </Button>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full">
                    <Avatar className="h-8 w-8">
                      {user.profile_image && <AvatarImage src={user.profile_image} alt={user.name} />}
                      <AvatarFallback className="bg-udaan-orange text-white">{getInitials(user.name)}</AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel>{user.name}</DropdownMenuLabel>
                  <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                    {user.email} • {user.user_type.charAt(0).toUpperCase() + user.user_type.slice(1)}
                  </DropdownMenuLabel>
                  <div className="px-2 py-1">
                    <VerificationBadge 
                      status={user.verification_status || 'unverified'} 
                      size="sm" 
                      showText={false}
                    />
                  </div>
                  <DropdownMenuSeparator />
                  <Link href="/profile">
                    <DropdownMenuItem>Profile</DropdownMenuItem>
                  </Link>
                  <Link href={getDashboardLink()}>
                    <DropdownMenuItem>Dashboard</DropdownMenuItem>
                  </Link>
                  <Link href="/settings">
                    <DropdownMenuItem>Settings</DropdownMenuItem>
                  </Link>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={handleLogout}>Log out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : mounted ? (
            <div className="flex items-center gap-3">
              <Link href="/login">
                <Button variant="ghost" className="flex items-center gap-2 text-white hover:text-udaan-orange hover:bg-white/10">
                  Sign In
                </Button>
              </Link>
              <Link href="/register">
                <Button className="bg-udaan-orange hover:bg-udaan-orange/90 border-none text-white">Get Started</Button>
              </Link>
            </div>
          ) : null}
        </div>
        <div className="flex md:hidden flex-1 items-center justify-end gap-2">
          {mounted && user && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="relative rounded-lg !p-2 !w-10 !h-10 border-2 border-white hover:bg-white/10"
              onClick={() => router.push('/cart')}
            >
              <ShoppingCart className="h-5 w-5 text-white" />
              {cartItemCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-udaan-orange text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-medium">
                  {cartItemCount > 99 ? '99+' : cartItemCount}
                </span>
              )}
            </Button>
          )}
          
          {/* Mobile Menu Sheet */}
          <Sheet>
            <SheetTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="text-white hover:bg-white/10" 
              >
                <Menu className="h-5 w-5 text-white" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>

            <SheetContent side="right" className="bg-blue-600 border-l border-blue-700 w-full p-0 [&>button]:hidden">
              <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
              <SheetDescription className="sr-only">
                Access navigation links, search, and user account options
              </SheetDescription>
              
              <div className="flex flex-col h-full relative z-10">
                {/* Fixed Header */}
                <div className="flex-shrink-0 py-2 px-3 border-b-2 border-white/30 bg-black/20">
                  <div className="flex items-center justify-between h-12">
                    <div className="flex items-center font-bold text-xl text-white -my-8">
                      <img src="/photos/logo.svg" alt="Navadrishti" className="h-32 w-32" />
                    </div>
                    
                    <SheetClose asChild>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-white hover:bg-white/10 h-8 w-8" 
                      >
                        <X className="h-5 w-5" />
                        <span className="sr-only">Close menu</span>
                      </Button>
                    </SheetClose>
                  </div>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-6">
                  {/* Profile Search */}
                  <div className="mb-6">
                      <div className="relative bg-white rounded-lg border-2 border-gray-200 overflow-hidden">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-600" />
                        <Input
                          type="text"
                          placeholder="Search people, NGOs, companies..."
                          className="w-full bg-white border-0 pl-8 pr-10 text-black placeholder:text-gray-500 focus:ring-0"
                          value={searchQuery}
                          onChange={(e) => handleSearchChange(e.target.value)}
                        />
                        {searchQuery && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="absolute right-2 top-1 h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                            onClick={clearSearch}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                    
                    {/* Mobile Search Results - Only show when there's a search query or results */}
                    {(searchQuery.length >= 1 || isSearching) && (
                      <div className="mt-3 border-2 border-gray-200 rounded-lg overflow-hidden">
                          <div className="bg-white">
                            <Command>
                              <CommandList className={showAllResults ? "max-h-80 overflow-y-auto" : ""}>
                                {isSearching ? (
                                  <div className="p-4 text-center text-muted-foreground">
                                    <div className="flex items-center justify-center gap-2">
                                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                      Searching...
                                    </div>
                                  </div>
                                ) : searchQuery.length >= 1 && searchResults.length > 0 ? (
                                  <>
                                    <CommandGroup heading={searchResults.length > 3 && !showAllResults ? `Top 3 of ${searchResults.length} profiles` : `Found ${searchResults.length} profile${searchResults.length > 1 ? 's' : ''}`}>
                                      {(showAllResults ? searchResults : searchResults.slice(0, 3)).map((profile) => (
                                        <CommandItem
                                          key={profile.id}
                                          value={profile.name}
                                          onSelect={() => handleProfileSelect(profile)}
                                          className="cursor-pointer p-4 hover:bg-gray-50 transition-colors"
                                        >
                                          <div className="flex items-center gap-3 w-full">
                                            <Avatar className="h-10 w-10 flex-shrink-0">
                                              {profile.profile_image && (
                                                <AvatarImage src={profile.profile_image} alt={profile.name} />
                                              )}
                                              <AvatarFallback className="text-xs bg-gradient-to-br from-blue-400 to-indigo-500 text-white font-semibold">
                                                {getInitials(profile.name)}
                                              </AvatarFallback>
                                            </Avatar>
                                            <div className="flex-1 min-w-0">
                                              <div className="flex items-center gap-2">
                                                <span className="font-medium truncate">{profile.name}</span>
                                                {profile.verification_status === 'verified' && (
                                                  <VerificationBadge status="verified" size="sm" showText={false} />
                                                )}
                                              </div>
                                              <div className="flex items-center gap-2 mt-1">
                                                  <Badge variant="secondary" className="text-xs capitalize bg-blue-100 text-blue-800 border border-blue-300 rounded-full px-2 py-1">
                                                    {profile.user_type}
                                                  </Badge>
                                                {profile.location && (
                                                  <span className="text-xs text-muted-foreground truncate">{profile.location}</span>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                    {searchResults.length > 3 && (
                                      <div className="border-t border-gray-200 p-2">
                                        {!showAllResults ? (
                                          <Button 
                                            variant="ghost" 
                                            className="w-full text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                                            onClick={() => setShowAllResults(true)}
                                          >
                                            View all {searchResults.length} profiles
                                          </Button>
                                        ) : (
                                          <Button 
                                            variant="ghost" 
                                            className="w-full text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-50"
                                            onClick={() => setShowAllResults(false)}
                                          >
                                            Show less
                                          </Button>
                                        )}
                                      </div>
                                    )}
                                  </>
                                ) : searchQuery.length >= 1 ? (
                                  <div className="p-4 text-center">
                                    <p className="text-muted-foreground text-sm">No profiles found for "{searchQuery}"</p>
                                    <p className="text-xs text-muted-foreground mt-1">Try searching for names, organizations, or locations</p>
                                  </div>
                                ) : null}
                              </CommandList>
                            </Command>
                          </div>
                        </div>
                    )}
                  {/* Navigation */}
                  <nav className="grid gap-2 text-base font-medium mb-8">
                    {/* Company Mobile Nav */}
                    {mounted && user?.user_type === 'company' && (
                      <>
                        <div className="mt-2 mb-1">
                          <div className="text-xs font-bold text-yellow-300 uppercase tracking-wider px-3">CSR Hub</div>
                        </div>
                        <Link href="/companies/csr-agent" className="flex items-center gap-3 px-3 py-2.5 text-white hover:bg-white/10 rounded-lg transition-colors">
                          <span>AI CSR Agent</span>
                        </Link>
                        <Link href="/companies/csr-budget" className="flex items-center gap-3 px-3 py-2.5 text-white hover:bg-white/10 rounded-lg transition-colors">
                          <span>Budget Planner</span>
                        </Link>
                        <Link href="/companies/impact-reports" className="flex items-center gap-3 px-3 py-2.5 text-white hover:bg-white/10 rounded-lg transition-colors">
                          <span>Impact Reports</span>
                        </Link>
                        <Link href="/csr-campaigns" className="flex items-center gap-3 px-3 py-2.5 text-white hover:bg-white/10 rounded-lg transition-colors">
                          <span>Browse NGO Partners</span>
                        </Link>

                        <div className="mt-3 mb-1">
                          <div className="text-xs font-bold text-yellow-300 uppercase tracking-wider px-3">Services</div>
                        </div>
                        <Link href="/service-requests" className="flex items-center gap-3 px-3 py-2.5 text-white hover:bg-white/10 rounded-lg transition-colors">
                          <span>Service Requests</span>
                        </Link>
                        <Link href="/service-offers" className="flex items-center gap-3 px-3 py-2.5 text-white hover:bg-white/10 rounded-lg transition-colors">
                          <span>Service Offers</span>
                        </Link>
                      </>
                    )}

                    {/* NGO Mobile Nav */}
                    {mounted && user?.user_type === 'ngo' && (
                      <>
                        <div className="mt-2 mb-1">
                          <div className="text-xs font-bold text-yellow-300 uppercase tracking-wider px-3">AI Tools</div>
                        </div>
                        <Link href="/ngos/ai-assistant" className="flex items-center gap-3 px-3 py-2.5 text-white hover:bg-white/10 rounded-lg transition-colors">
                          <span>Proposal Generator</span>
                        </Link>
                        <Link href="/ngos/ai-assistant?tab=documentation" className="flex items-center gap-3 px-3 py-2.5 text-white hover:bg-white/10 rounded-lg transition-colors">
                          <span>Documentation Helper</span>
                        </Link>
                        <Link href="/ngos/ai-assistant?tab=outreach" className="flex items-center gap-3 px-3 py-2.5 text-white hover:bg-white/10 rounded-lg transition-colors">
                          <span>Outreach Creator</span>
                        </Link>

                        <div className="mt-3 mb-1">
                          <div className="text-xs font-bold text-yellow-300 uppercase tracking-wider px-3">CSR & Funding</div>
                        </div>
                        <Link href="/csr-campaigns" className="flex items-center gap-3 px-3 py-2.5 text-white hover:bg-white/10 rounded-lg transition-colors">
                          <span>Browse CSR Campaigns</span>
                        </Link>
                        <Link href="/ngos/campaign-updates" className="flex items-center gap-3 px-3 py-2.5 text-white hover:bg-white/10 rounded-lg transition-colors">
                          <span>Campaign Updates</span>
                        </Link>
                        <Link href="/marketplace/fundraising" className="flex items-center gap-3 px-3 py-2.5 text-white hover:bg-white/10 rounded-lg transition-colors">
                          <span>Fundraising Campaigns</span>
                        </Link>

                        <div className="mt-3 mb-1">
                          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3">Services</div>
                        </div>
                        <Link href="/service-offers" className="flex items-center gap-3 px-3 py-2.5 text-white hover:bg-white/10 rounded-lg transition-colors">
                          <span>My Service Offers</span>
                        </Link>
                        <Link href="/service-requests" className="flex items-center gap-3 px-3 py-2.5 text-white hover:bg-white/10 rounded-lg transition-colors">
                          <span>My Service Requests</span>
                        </Link>
                      </>
                    )}

                    {/* Individual Mobile Nav */}
                    {mounted && user?.user_type === 'individual' && (
                      <>
                        <div className="mt-2 mb-1">
                          <div className="text-xs font-bold text-yellow-300 uppercase tracking-wider px-3">Opportunities</div>
                        </div>
                        <Link href="/service-requests" className="flex items-center gap-3 px-3 py-2.5 text-white hover:bg-white/10 rounded-lg transition-colors">
                          <span>Service Requests</span>
                        </Link>
                        <Link href="/service-offers" className="flex items-center gap-3 px-3 py-2.5 text-white hover:bg-white/10 rounded-lg transition-colors">
                          <span>Service Offers</span>
                        </Link>
                        <Link href="/csr-campaigns" className="flex items-center gap-3 px-3 py-2.5 text-white hover:bg-white/10 rounded-lg transition-colors">
                          <span>CSR Campaigns</span>
                        </Link>

                        <div className="mt-3 mb-1">
                          <div className="text-xs font-bold text-yellow-300 uppercase tracking-wider px-3">My Impact</div>
                        </div>
                        <Link href={`/profile/${user.id}`} className="flex items-center gap-3 px-3 py-2.5 text-white hover:bg-white/10 rounded-lg transition-colors">
                          <span>Impact Profile</span>
                        </Link>
                        <Link href={`/profile/${user.id}?tab=history`} className="flex items-center gap-3 px-3 py-2.5 text-white hover:bg-white/10 rounded-lg transition-colors">
                          <span>Recent Activity</span>
                        </Link>
                        <Link href={`/profile/${user.id}?tab=achievements`} className="flex items-center gap-3 px-3 py-2.5 text-white hover:bg-white/10 rounded-lg transition-colors">
                          <span>Achievements</span>
                        </Link>
                        <Link href={`/profile/${user.id}?tab=impact`} className="flex items-center gap-3 px-3 py-2.5 text-white hover:bg-white/10 rounded-lg transition-colors">
                          <span>Impact Metrics</span>
                        </Link>
                      </>
                    )}

                    {/* Non-logged in users */}
                    {!user && (
                      <>
                        <Link href="/service-requests" className="flex items-center gap-3 px-3 py-2.5 text-white hover:bg-white/10 rounded-lg transition-colors">
                          <span>Service Requests</span>
                        </Link>
                        <Link href="/service-offers" className="flex items-center gap-3 px-3 py-2.5 text-white hover:bg-white/10 rounded-lg transition-colors">
                          <span>Service Offers</span>
                        </Link>
                      </>
                    )}

                    {/* Marketplace - For all users */}
                    <div className="mt-3 mb-1">
                      <div className="text-xs font-bold text-yellow-300 uppercase tracking-wider px-3">Marketplace</div>
                    </div>
                    <Link href="/marketplace" className="flex items-center gap-3 px-3 py-2.5 text-white hover:bg-white/10 rounded-lg transition-colors">
                      <span>Browse Products</span>
                    </Link>
                    {mounted && user?.user_type === 'ngo' && (
                      <Link href="/marketplace/fundraising" className="flex items-center gap-3 px-3 py-2.5 text-white hover:bg-white/10 rounded-lg transition-colors">
                        <span>Fundraising</span>
                      </Link>
                    )}
                    {mounted && user && (
                      <>
                        <Link href={`${getDashboardLink()}?tab=marketplace&subtab=selling`} className="flex items-center gap-3 px-3 py-2.5 text-white hover:bg-white/10 rounded-lg transition-colors">
                          <span>My Listings</span>
                        </Link>
                        <Link href="/orders" className="flex items-center gap-3 px-3 py-2.5 text-white hover:bg-white/10 rounded-lg transition-colors">
                          <span>My Orders</span>
                        </Link>
                      </>
                    )}

                    <Link 
                      href="/cart" 
                      className="flex items-center gap-3 px-3 py-2.5 text-white hover:bg-white/10 rounded-lg transition-colors duration-300"
                    >
                      <ShoppingCart className="h-5 w-5" />
                      <span>Cart</span>
                      {cartItemCount > 0 && (
                        <span className="bg-udaan-orange text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-medium ml-auto">
                          {cartItemCount > 99 ? '99+' : cartItemCount}
                        </span>
                      )}
                    </Link>
                  </nav>

                  {/* User Section */}
                  <div className="border-t border-white/20 pt-6">
                    {mounted && user ? (
                      <div>
                        <div className="flex items-center gap-4 mb-6">
                          <Avatar className="h-12 w-12">
                            {user.profile_image && <AvatarImage src={user.profile_image} alt={user.name} />}
                            <AvatarFallback className="bg-udaan-orange text-white font-semibold text-lg">{getInitials(user.name)}</AvatarFallback>
                          </Avatar>
                          <div className="grid gap-1">
                            <p className="text-lg font-medium text-white">{user.name}</p>
                            <p className="text-sm text-white/80">{user.email}</p>
                          </div>
                        </div>
                        
                        <div className="space-y-3 pb-8">
                          <Link href="/profile">
                            <Button variant="outline" className="w-full h-12 text-udaan-navy border-udaan-navy bg-white hover:bg-udaan-orange hover:border-udaan-orange hover:text-white transition-colors">
                              Profile
                            </Button>
                          </Link>
                          <Link href={getDashboardLink()}>
                            <Button variant="outline" className="w-full h-12 text-udaan-navy border-udaan-navy bg-white hover:bg-udaan-orange hover:border-udaan-orange hover:text-white transition-colors">
                              Dashboard
                            </Button>
                          </Link>
                          <Link href="/settings">
                            <Button variant="outline" className="w-full h-12 text-udaan-navy border-udaan-navy bg-white hover:bg-udaan-orange hover:border-udaan-orange hover:text-white transition-colors">
                              Settings
                            </Button>
                          </Link>
                          <Button 
                            variant="outline" 
                            className="w-full h-12 text-white border-red-500 bg-red-500 hover:bg-red-600 hover:border-red-600 hover:text-white transition-colors" 
                            onClick={handleLogout}
                          >
                            Log out
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3 pb-8">
                        <Link href="/login">
                          <Button variant="outline" className="w-full h-12 text-udaan-navy border-udaan-navy bg-white hover:bg-udaan-navy hover:text-white transition-colors">
                            Sign In
                          </Button>
                        </Link>
                        <Link href="/register">
                          <Button className="w-full h-12 bg-udaan-orange hover:bg-udaan-orange/90 border-none text-white transition-colors">
                            Get Started
                          </Button>
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}

