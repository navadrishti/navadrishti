"use client"

import { useState, useEffect, useRef, type KeyboardEventHandler, type FocusEventHandler } from "react"
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
import { Award, Bell, ChevronDown, Menu, Search, ShoppingBag, X, GraduationCap, Briefcase, Building, LogIn, MessageSquare, ArrowLeft } from "lucide-react"
import { VerificationBadge } from "@/components/verification-badge"
import { visibleCaBadgeNumber } from "@/lib/auth"
import { cn } from "@/lib/utils"
import { getLaunchHeaderNavItems, type LaunchHeaderNavItem } from "@/lib/access-control"
import { ProductBrand } from "@/components/product-brand"

interface ProfileSearchResult {
  id: number;
  name: string;
  email: string;
  user_type: 'individual' | 'ngo' | 'company';
  profile_image?: string;
  verification_status?: string;
  location?: string;
}

interface NavigationItem extends LaunchHeaderNavItem {}

const SEARCH_PLACEHOLDER = "Search people, NGOs, companies..."

function fitPlaceholderWithDots(text: string, el: HTMLInputElement) {
  const style = getComputedStyle(el)
  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")
  if (!ctx) return text

  ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
  const maxWidth = el.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0)
  if (maxWidth <= 0 || ctx.measureText(text).width <= maxWidth) return text

  const dots = ".."
  const dotsWidth = ctx.measureText(dots).width
  if (dotsWidth >= maxWidth) return dots

  let low = 0
  let high = text.length
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (ctx.measureText(text.slice(0, mid)).width + dotsWidth <= maxWidth) {
      low = mid
    } else {
      high = mid - 1
    }
  }

  return `${text.slice(0, low).trimEnd()}${dots}`
}

function NavbarSearchInput({
  value,
  onChange,
  onClear,
  onKeyDown,
  onFocus,
  onBlur,
}: {
  value: string
  onChange: (value: string) => void
  onClear: () => void
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>
  onFocus?: FocusEventHandler<HTMLInputElement>
  onBlur?: FocusEventHandler<HTMLInputElement>
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [placeholder, setPlaceholder] = useState(SEARCH_PLACEHOLDER)

  useEffect(() => {
    const el = inputRef.current
    if (!el) return

    const update = () => setPlaceholder(fitPlaceholderWithDots(SEARCH_PLACEHOLDER, el))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="relative w-full overflow-hidden rounded-lg border-2 border-gray-300">
      <div className="relative bg-white">
        <Input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          title={SEARCH_PLACEHOLDER}
          className="w-full border-0 bg-white pl-8 pr-10 text-black placeholder:truncate placeholder:text-gray-500 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          onBlur={onBlur}
        />
        <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-gray-600" />
        <button
          type="button"
          aria-label="Clear search"
          className={`absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 ${value.trim() ? "opacity-100" : "pointer-events-none opacity-0"}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClear}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

function HeaderNavLink({
  item,
  className,
}: {
  item: NavigationItem
  className: string
}) {
  if (item.external) {
    return (
      <a
        href={item.href}
        target={item.href.startsWith('mailto:') ? undefined : '_blank'}
        rel={item.href.startsWith('mailto:') ? undefined : 'noopener noreferrer'}
        className={className}
        title={item.description}
      >
        {item.label}
      </a>
    )
  }

  return (
    <Link href={item.href} className={className} title={item.description}>
      {item.label}
    </Link>
  )
}

export function Header({ className = '' }: { className?: string } = {}) {
  const { user, loading, logout } = useAuth()
  const router = useRouter()
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ProfileSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [showAllResults, setShowAllResults] = useState(false)
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const profileMenuTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Prevent hydration mismatch by only rendering user-dependent content after mount
  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    return () => {
      if (profileMenuTimeoutRef.current) {
        clearTimeout(profileMenuTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('nd-mobile-menu-state', { detail: { open: mobileSheetOpen } }))
  }, [mobileSheetOpen])

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
    await logout()
    await smoothNavigate(router, '/', { delay: 100 })
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
    if (!mounted || !user) return 'Browse NGO needs'
    if (user.user_type === 'individual') return 'Volunteer for NGO needs'
    if (user.user_type === 'company') return 'Browse NGO needs to fulfil'
    return 'Manage your posted needs'
  }

  const serviceOfferDescription = () => {
    if (!mounted || !user) return 'Browse capability offers'
    if (user.user_type === 'individual') return 'Browse & post your skills/services'
    if (user.user_type === 'company') return 'Browse & post your capabilities'
    return 'Browse & post capability offers'
  }

  const desktopNavItems = getLaunchHeaderNavItems([
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
  ])
  
  return (
    <>
    <aside className={`platform-sidebar fixed inset-y-0 left-0 top-0 z-50 hidden h-dvh w-60 flex-col border-r border-white/10 bg-udaan-blue text-white md:flex ${className}`}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 border-b border-white/15 px-4 py-4">
          <ProductBrand href="/" nameClassName="text-white" poweredClassName="text-white/75" />
        </div>
        <div className="relative shrink-0 px-3 pt-4">
            <div className="relative z-50">
              <NavbarSearchInput
                value={searchQuery}
                onChange={handleSearchChange}
                onClear={clearSearch}
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
                  setTimeout(() => {
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
            </div>
            
            {/* Search Results Popover */}
            {showResults && (
              <div 
                className="absolute left-full top-0 z-50 ml-2" 
                data-search-dropdown="true"
                onMouseDown={(e) => e.preventDefault()}
              >
                <div className="w-80 p-0 border-2 border-gray-300 rounded-lg shadow-lg overflow-hidden bg-white">
                    <div className="bg-white">
                      <Command shouldFilter={false} className="!bg-white" style={{ backgroundColor: 'white' }}>
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
                                        <AvatarFallback className="text-xs bg-udaan-orange text-white font-semibold">
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
          <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4">
            {desktopNavItems.map((item) => (
              <HeaderNavLink
                key={`desktop-nav-${item.href}`}
                item={item}
                className="rounded-md px-3 py-2 text-sm font-medium text-white hover:bg-white/10 hover:text-udaan-orange focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 transition-colors"
              />
            ))}
          </nav>
        <div className="shrink-0 border-t border-white/15 p-3">
          {mounted && user ? (
            <div
              onMouseEnter={openProfileMenu}
              onMouseLeave={() => closeProfileMenuWithDelay()}
              className="relative shrink-0"
            >
              <button
                type="button"
                className="inline-flex h-10 w-full shrink-0 items-center gap-2 rounded-md bg-transparent px-2 text-white hover:bg-white/10 hover:text-udaan-orange transition-colors"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => e.preventDefault()}
                title={profileTriggerLabel}
              >
                <Avatar className="h-9 w-9 shrink-0">
                  {user.profile_image && <AvatarImage src={user.profile_image} alt={user.name} />}
                  <AvatarFallback className="bg-udaan-orange text-white">{getInitials(user.name)}</AvatarFallback>
                </Avatar>
                <span className="max-w-[148px] truncate text-sm font-medium">
                  {profileTriggerLabel}
                </span>
                <ChevronDown className="ml-auto h-4 w-4 shrink-0 opacity-80" />
              </button>

                    {isProfileMenuOpen && (
                <div className="absolute left-full bottom-0 z-50 ml-2 w-56 overflow-hidden rounded-md border bg-white p-1 text-black shadow-lg">
                  <div className="truncate px-2 py-1.5 text-sm font-semibold leading-5 text-gray-900">{user.name}</div>
                  <div className="px-2 py-1 text-xs text-muted-foreground">
                    <span className="block truncate">{user.email} • {user.user_type.charAt(0).toUpperCase() + user.user_type.slice(1)}</span>
                  </div>
                  {user.verification_status === 'verified' ? (
                    <div className="min-w-0 overflow-hidden px-2 pb-1.5">
                      <VerificationBadge
                        status="verified"
                        size="readable"
                        showText={false}
                        badgeNumber={
                          visibleCaBadgeNumber(user.verification_status, user.profile_data || user.profile) ||
                          user.ca_badge_number
                        }
                        className="max-w-full min-w-0"
                      />
                    </div>
                  ) : null}
                  <div className="my-1 h-px bg-gray-200" />
                  <Link href={getDashboardLink()} className="block rounded px-2 py-2 text-sm text-gray-800 hover:bg-gray-100">Dashboard</Link>
                  <Link href="/help-support" className="block rounded px-2 py-2 text-sm text-gray-800 hover:bg-gray-100">Help & Support</Link>
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
          ) : (
            <div className="flex flex-col gap-2">
              <Link href="/login">
                <Button variant="ghost" className="flex w-full items-center justify-center gap-2 text-white hover:text-udaan-orange hover:bg-white/10">
                  Sign In
                </Button>
              </Link>
              <Link href="/register">
                <Button className="w-full bg-udaan-orange hover:bg-udaan-orange/90 border-none text-white">Get Started</Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </aside>
    <header className="sticky top-0 z-50 w-full border-b bg-udaan-blue text-white md:hidden">
      <div className="flex h-16 items-center gap-4 px-4">
        <ProductBrand href="/" nameClassName="text-white" poweredClassName="text-white/75" />
        <div className="flex flex-1 items-center justify-end gap-2">
          {/* Mobile Menu Sheet */}
          <Sheet open={mobileSheetOpen} onOpenChange={setMobileSheetOpen}>
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
                    <ProductBrand href="/" size="sm" nameClassName="text-white" poweredClassName="text-white/75" />
                    
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
                      <NavbarSearchInput
                        value={searchQuery}
                        onChange={handleSearchChange}
                        onClear={clearSearch}
                      />
                    </div>
                    
                    {/* Mobile Search Results - Only show when there's a search query or results */}
                    {(searchQuery.length >= 1 || isSearching) && (
                      <div className="mt-3 border-2 border-gray-200 rounded-lg overflow-hidden">
                          <div className="bg-white">
                            <Command shouldFilter={false}>
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
                                              <AvatarFallback className="text-xs bg-udaan-orange text-white font-semibold">
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
                      <HeaderNavLink
                        key={`mobile-nav-${item.href}`}
                        item={item}
                        className="flex items-center gap-3 px-3 py-2.5 text-white hover:bg-white/10 rounded-lg transition-colors"
                      />
                    ))}
                  </nav>

                  {/* User Section */}
                  <div className="border-t border-white/20 pt-6">
                    {user ? (
                      <div>
                        <div className="mb-6 flex min-w-0 items-center gap-4">
                          <Avatar className="h-12 w-12">
                            {user.profile_image && <AvatarImage src={user.profile_image} alt={user.name} />}
                            <AvatarFallback className="bg-udaan-orange text-white font-semibold text-lg">{getInitials(user.name)}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 grid gap-1">
                            <p className="truncate text-lg font-medium text-white">{user.name}</p>
                            <p className="truncate text-sm text-white/80">{user.email}</p>
                          </div>
                        </div>
                        
                        <div className="space-y-3 pb-8">
                          <Link href={getDashboardLink()}>
                            <Button variant="outline" className="w-full h-12 text-udaan-navy border-udaan-navy bg-white hover:bg-udaan-orange hover:border-udaan-orange hover:text-white transition-colors">
                              Dashboard
                            </Button>
                          </Link>
                          <Link href="/help-support">
                            <Button variant="outline" className="w-full h-12 text-udaan-navy border-udaan-navy bg-white hover:bg-udaan-orange hover:border-udaan-orange hover:text-white transition-colors">
                              Help & Support
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
    </>
  )
}

type AuthBackButtonProps = {
  fallbackHref?: string
  className?: string
  variant?: 'link' | 'button'
}

export function AuthBackButton({
  fallbackHref = '/',
  className,
  variant = 'link',
}: AuthBackButtonProps) {
  const router = useRouter()

  const handleBack = () => {
    if (typeof window !== 'undefined') {
      const referrer = document.referrer
      const hasSameOriginReferrer =
        referrer.length > 0 && new URL(referrer).origin === window.location.origin

      if (hasSameOriginReferrer || window.history.length > 1) {
        router.back()
        return
      }
    }

    router.push(fallbackHref)
  }

  if (variant === 'link') {
    return (
      <button
        type="button"
        onClick={handleBack}
        className={cn(
          'inline-flex items-center text-sm font-medium text-primary hover:underline',
          className
        )}
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        Back
      </button>
    )
  }

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={handleBack}
      className={cn(
        'px-0 text-primary hover:text-primary/80 hover:bg-transparent active:bg-transparent focus-visible:bg-transparent focus-visible:ring-0',
        className
      )}
    >
      <ArrowLeft className="mr-2 h-4 w-4" />
      Back
    </Button>
  )
}

export function AuthCardBackRow({
  fallbackHref,
}: Pick<AuthBackButtonProps, 'fallbackHref'>) {
  return (
    <div className="text-sm">
      <AuthBackButton fallbackHref={fallbackHref} />
    </div>
  )
}
