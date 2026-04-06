"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { smoothNavigate } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command"
import { Badge } from "@/components/ui/badge"
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription, SheetClose } from "@/components/ui/sheet"
import { Award, Bell, ChevronDown, Menu, Search, ShoppingBag, X, GraduationCap, Briefcase, Building, LogIn, MessageSquare } from "lucide-react"
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

interface NavigationItem {
  label: string;
  href: string;
  description: string;
}

export function Header() {
  const { user, logout, refreshUser } = useAuth()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ProfileSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [showAllResults, setShowAllResults] = useState(false)
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const profileMenuTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    return () => {
      if (profileMenuTimeoutRef.current) {
        clearTimeout(profileMenuTimeoutRef.current)
      }
    }
  }, [])

  const openProfileMenu = () => {
    if (profileMenuTimeoutRef.current) {
      clearTimeout(profileMenuTimeoutRef.current)
      profileMenuTimeoutRef.current = null
    }
    setIsProfileMenuOpen(true)
  }

  const closeProfileMenuWithDelay = (delayMs = 220) => {
    if (profileMenuTimeoutRef.current) {
      clearTimeout(profileMenuTimeoutRef.current)
    }
    profileMenuTimeoutRef.current = setTimeout(() => {
      setIsProfileMenuOpen(false)
    }, delayMs)
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
  
  const isIndividual = user?.user_type === 'individual'
  const profileTriggerLabel = user?.name || 'Profile'

  const serviceRequestDescription = () => {
    if (!user) return 'Browse NGO needs'
    if (user.user_type === 'individual') return 'Volunteer for NGO needs'
    if (user.user_type === 'company') return 'Browse NGO needs to fulfil'
    return 'Manage your posted needs'
  }

  const serviceOfferDescription = () => {
    if (!user) return 'Browse capability offers'
    if (user.user_type === 'individual') return 'Browse & post your skills/services'
    if (user.user_type === 'company') return 'Browse & post your capabilities'
    return 'Browse & post capability offers'
  }

  const desktopNavItems: NavigationItem[] = [
    {
      label: 'Feed',
      href: '/home',
      description: 'Latest posts and updates'
    },
    {
      label: 'NGO Network',
      href: '/ngo-network',
      description: 'Browse verified NGOs'
    },
    {
      label: 'NGO Requests',
      href: '/service-requests',
      description: serviceRequestDescription()
    },
    {
      label: 'Capability Offers',
      href: '/service-offers',
      description: serviceOfferDescription()
    },
    {
      label: 'CSR Campaigns',
      href: '/csr-campaigns',
      description: 'Browse active initiatives'
    }
  ]
  
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-udaan-blue text-white">
      <div className="udaan-container flex h-16 items-center px-4 md:px-6">
        <Link href="/home" className="flex shrink-0 items-center font-bold text-xl">
          <img src="/photos/logo.svg" alt="Navadrishti" className="h-36 w-36 shrink-0" />
        </Link>
        <div className="hidden md:flex md:flex-1 md:items-center md:justify-end md:gap-4 lg:gap-6">
          <nav className="order-2 flex items-center justify-end gap-1.5 lg:gap-2">
            {mounted && (
              <>
                {desktopNavItems.map((item) => (
                  <Link
                    key={`desktop-nav-${item.href}`}
                    href={item.href}
                    className="whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm font-medium text-white hover:text-udaan-orange focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 transition-colors"
                    title={item.description}
                  >
                    {item.label}
                  </Link>
                ))}

              </>
            )}
          </nav>
          <div className="relative order-1 mr-auto hidden md:block">
            <div className="relative flex items-center z-50">
              <div className="relative border-2 border-gray-300 rounded-lg overflow-hidden">
                <div className="relative bg-white">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-600 pointer-events-none z-10" />
                  <Input
                    type="text"
                    placeholder="Search people, NGOs, companies..."
                    className="w-52 md:w-64 lg:w-72 xl:w-80 bg-white border-0 pl-8 pr-10 text-black placeholder:text-gray-500 focus:ring-0 relative z-20"
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        e.preventDefault()
                        clearSearch()
                        e.currentTarget.blur()
                      }
                    }}
                    onFocus={() => {
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
                          if (!searchQuery.trim()) {
                            setShowResults(false)
                            setShowAllResults(false)
                          }
                        }
                      }, 150)
                    }}
                  />
                  <button
                    type="button"
                    aria-label="Clear search"
                    className={`absolute right-2 top-1/2 z-30 -translate-y-1/2 rounded-full p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 ${searchQuery.trim() ? "opacity-100" : "pointer-events-none opacity-0"}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={clearSearch}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
            
            {/* Search Results Popover */}
            {showResults && (
              <div 
                className="absolute top-full left-0 mt-1 z-50" 
                data-search-dropdown="true"
                onMouseDown={(e) => e.preventDefault()} // Prevent input blur when clicking dropdown
              >
                <div className="w-52 md:w-64 lg:w-72 xl:w-80 p-0 border-2 border-gray-300 rounded-lg shadow-lg overflow-hidden bg-white">
                    <div className="bg-white">
                      <Command className="!bg-white" style={{ backgroundColor: 'white' }}>
                        <CommandList className={showAllResults ? "!bg-white max-h-80 overflow-y-auto" : "!bg-white"}>
                          {isSearching ? (
                            <div className="p-4 text-center text-muted-foreground">
                              <div className="flex items-center justify-center gap-2">
                                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                Searching...
                              </div>
                            </div>
                          ) : searchQuery.length >= 1 && searchResults.length > 0 ? (
                            <>
                              <CommandGroup className="!bg-white" heading={searchResults.length > 3 && !showAllResults ? `Top 3 of ${searchResults.length} profiles` : `Found ${searchResults.length} profile${searchResults.length > 1 ? 's' : ''}`}>
                                {(showAllResults ? searchResults : searchResults.slice(0, 3)).map((profile) => (
                                  <CommandItem
                                    key={profile.id}
                                    value={profile.name}
                                    onSelect={() => handleProfileSelect(profile)}
                                    className="cursor-pointer p-4 hover:bg-[#eaf4ff] data-[selected=true]:bg-[#eaf4ff] data-[selected=true]:text-gray-900 transition-colors"
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
                                          <Badge
                                            variant="outline"
                                            className="text-xs capitalize rounded-full px-2 py-1 !bg-white !text-gray-800 border-gray-300 hover:!bg-white hover:!text-gray-800"
                                          >
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
            <div
              onMouseEnter={openProfileMenu}
              onMouseLeave={() => closeProfileMenuWithDelay()}
              className="relative order-3"
            >
              <button
                type="button"
                className="inline-flex h-10 items-center gap-2 rounded-md bg-transparent px-2.5 text-white hover:text-udaan-orange transition-colors"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => e.preventDefault()}
              >
                <Avatar className="h-9 w-9">
                  {user.profile_image && <AvatarImage src={user.profile_image} alt={user.name} />}
                  <AvatarFallback className="bg-udaan-orange text-white">{getInitials(user.name)}</AvatarFallback>
                </Avatar>
                <span className="max-w-[120px] truncate text-sm font-medium">{profileTriggerLabel}</span>
                <ChevronDown className="h-4 w-4 opacity-80" />
              </button>

              {isProfileMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 rounded-md border bg-white p-1 text-black shadow-lg">
                  <div className="px-2 py-1.5 text-sm font-semibold text-gray-900">{user.name}</div>
                  <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground">
                    <span className="truncate">{user.email} • {user.user_type.charAt(0).toUpperCase() + user.user_type.slice(1)}</span>
                    <VerificationBadge
                      status={user.verification_status || 'unverified'}
                      size="sm"
                      showText={false}
                    />
                  </div>
                  <div className="my-1 h-px bg-gray-200" />
                  <Link href="/profile" className="block rounded px-2 py-2 text-sm text-gray-800 hover:bg-gray-100">Profile</Link>
                  <Link href={getDashboardLink()} className="block rounded px-2 py-2 text-sm text-gray-800 hover:bg-gray-100">Dashboard</Link>
                  <Link href="/settings" className="block rounded px-2 py-2 text-sm text-gray-800 hover:bg-gray-100">Settings</Link>
                  <div className="my-1 h-px bg-gray-200" />
                  <button
                    type="button"
                    className="block w-full rounded px-2 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                    onClick={handleLogout}
                  >
                    Log out
                  </button>
                </div>
              )}
            </div>
          ) : mounted ? (
            <div className="order-3 flex shrink-0 items-center gap-3">
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

            <SheetContent side="right" className="bg-udaan-blue border-l border-udaan-blue w-full p-0 [&>button]:hidden">
              <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
              <SheetDescription className="sr-only">
                Access navigation links, search, and user account options
              </SheetDescription>
              
              <div className="flex flex-col h-full relative z-10">
                {/* Fixed Header */}
                <div className="flex-shrink-0 py-2 px-3 border-b border-white/20 bg-udaan-blue">
                  <div className="flex items-center justify-between h-12">
                    <Link href="/home" className="flex items-center font-bold text-xl text-white -my-8">
                      <img src="/photos/logo.svg" alt="Navadrishti" className="h-32 w-32" />
                    </Link>
                    
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
                <div className="flex-1 overflow-y-auto p-6 bg-udaan-blue">
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
                    {desktopNavItems.map((item) => (
                      <Link
                        key={`mobile-nav-${item.href}`}
                        href={item.href}
                        className="flex items-center gap-3 px-3 py-2.5 text-white hover:bg-white/10 rounded-lg transition-colors"
                        title={item.description}
                      >
                        <span>{item.label}</span>
                      </Link>
                    ))}
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

