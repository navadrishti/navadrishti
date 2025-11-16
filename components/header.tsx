"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
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
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ProfileSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [isSearchExpanded, setIsSearchExpanded] = useState(false)
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [showAllResults, setShowAllResults] = useState(false)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  

  
  // Profile search functionality
  const searchProfiles = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([])
      return
    }

    setIsSearching(true)
    try {
      const response = await fetch(`/api/search/profiles?q=${encodeURIComponent(query.trim())}&limit=8`)
      if (response.ok) {
        const data = await response.json()
        setSearchResults(data.profiles || [])
      } else {
        setSearchResults([])
      }
    } catch (error) {
      console.error('Profile search error:', error)
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }

  // Debounced search
  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    // Show dropdown immediately when typing
    if (isInputFocused) {
      setShowResults(true)
    }

    searchTimeoutRef.current = setTimeout(() => {
      searchProfiles(value)
    }, 150) // Reduced delay from 300ms to 150ms
  }

  // Handle profile selection
  const handleProfileSelect = (profile: ProfileSearchResult) => {
    setSearchQuery('')
    setSearchResults([])
    setShowResults(false)
    router.push(`/profile/${profile.id}`)
  }

  // Clear search
  const clearSearch = () => {
    setSearchQuery('')
    setSearchResults([])
    setShowResults(false)
    setIsSearchExpanded(false)
  }

  // Get user type icon
  const getUserTypeIcon = (userType: string) => {
    switch (userType) {
      case 'individual': return '👤'
      case 'ngo': return '🏢'
      case 'company': return '🏭'
      default: return '👤'
    }
  }
  
  const handleLogout = () => {
    logout()
    router.push('/home')
  }  // Generate initials for avatar fallback
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
          <nav className="flex items-center gap-4 lg:gap-6">
            <Link href="/service-requests" className="flex items-center gap-2 text-sm font-medium udaan-nav-link">
              <Award className="h-4 w-4" />
              Service Requests
            </Link>
            <Link href="/service-offers" className="flex items-center gap-2 text-sm font-medium udaan-nav-link">
              <Briefcase className="h-4 w-4" />
              Service Offers
            </Link>
            <Link href="/marketplace" className="flex items-center gap-2 text-sm font-medium udaan-nav-link">
              <ShoppingBag className="h-4 w-4" />
              Marketplace
            </Link>
          </nav>
          <div className="relative hidden md:block">
            <div className="relative flex items-center">
              {!isSearchExpanded ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative rounded-lg !p-2 !w-10 !h-10"
                  style={{
                    border: '1px solid',
                    borderImage: 'linear-gradient(137.48deg, #ffdb3b 10%, #fe53bb 45%, #8f51ea 67%, #0044ff 87%) 1',
                    borderImageSlice: 1,
                    background: 'transparent'
                  }}
                  onClick={() => setIsSearchExpanded(true)}
                >
                  <Search className="h-5 w-5 text-white" />
                </Button>
              ) : (
                <div className="relative flex items-center z-50">
                  <div className="relative p-[2px] bg-gradient-to-r from-yellow-300 via-pink-500 to-blue-500 rounded-lg">
                    <div className="relative bg-white rounded-lg">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-600 pointer-events-none z-10" />
                      <Input
                        type="text"
                        placeholder="Search people, NGOs, companies..."
                        className="w-64 md:w-80 lg:w-96 rounded-lg bg-white border-0 pl-8 pr-12 text-black placeholder:text-gray-500 focus:ring-0 relative z-20"
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
                className="absolute top-full left-0 mt-2 z-50" 
                data-search-dropdown="true"
                onMouseDown={(e) => e.preventDefault()} // Prevent input blur when clicking dropdown
              >
                <div className="w-64 md:w-80 lg:w-96 p-0 border-0">
                  <div className="relative p-[2px] bg-gradient-to-r from-yellow-300 via-pink-500 to-blue-500 rounded-lg">
                    <div className="bg-white rounded-lg overflow-hidden">
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
                                          <div className="relative p-[1px] bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 rounded-full">
                                            <Badge variant="secondary" className="text-xs capitalize bg-white text-gray-800 border-0 rounded-full px-2 py-1">
                                              {profile.user_type}
                                            </Badge>
                                          </div>
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
              </div>
            )}
          </div>          {user ? (
            <>
              {/* Cart Icon with Badge - Only for logged in users */}
              <Button 
                variant="ghost" 
                size="icon" 
                className="relative rounded-lg !p-2 !w-10 !h-10"
                style={{
                  border: '1px solid',
                  borderImage: 'linear-gradient(137.48deg, #ffdb3b 10%, #fe53bb 45%, #8f51ea 67%, #0044ff 87%) 1',
                  borderImageSlice: 1,
                  background: 'transparent'
                }}
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
                  <Link href="/orders">
                    <DropdownMenuItem>My Orders</DropdownMenuItem>
                  </Link>
                  <Link href="/settings">
                    <DropdownMenuItem>Settings</DropdownMenuItem>
                  </Link>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={handleLogout}>Log out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <Link href="/login">
                <Button variant="ghost" className="flex items-center gap-2 text-white hover:text-udaan-orange hover:bg-white/10">
                  <LogIn className="h-4 w-4" />
                  Sign In
                </Button>
              </Link>
              <Link href="/register">
                <Button className="bg-udaan-orange hover:bg-udaan-orange/90 border-none text-white">Get Started</Button>
              </Link>
            </div>
          )}
        </div>
        <div className="flex md:hidden flex-1 items-center justify-end gap-2">
          {user && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="relative rounded-lg !p-2 !w-10 !h-10"
              style={{
                border: '1px solid',
                borderImage: 'linear-gradient(137.48deg, #ffdb3b 10%, #fe53bb 45%, #8f51ea 67%, #0044ff 87%) 1',
                borderImageSlice: 1,
                background: 'transparent'
              }}
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
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>

            <SheetContent side="right" className="bg-gradient-to-br from-black via-gray-900 to-black border-l border-gray-800 w-full p-0">
              <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
              <SheetDescription className="sr-only">
                Access navigation links, search, and user account options
              </SheetDescription>
              
              {/* Background gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-r from-purple-600/5 via-pink-600/5 to-indigo-600/5 pointer-events-none"></div>
              
              <div className="flex flex-col h-full relative z-10">
                {/* Fixed Header */}
                <div className="flex-shrink-0 p-6 border-b border-white/10">
                  <div className="flex items-center justify-between">
                    <Link 
                      href="/home" 
                      className="flex items-center font-bold text-xl text-white"
                    >
                      <img src="/photos/logo.svg" alt="Navadrishti" className="h-36 w-36" />
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
                <div className="flex-1 overflow-y-auto p-6">
                  {/* Profile Search */}
                  <div className="mb-6">
                    <div className="relative p-[2px] bg-gradient-to-r from-yellow-300 via-pink-500 to-blue-500 rounded-lg">
                      <div className="relative bg-white rounded-lg">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-600" />
                        <Input
                          type="text"
                          placeholder="Search people, NGOs, companies..."
                          className="w-full rounded-lg bg-white border-0 pl-8 pr-10 text-black placeholder:text-gray-500 focus:ring-0"
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
                      <div className="mt-3">
                        <div className="relative p-[2px] bg-gradient-to-r from-yellow-300 via-pink-500 to-blue-500 rounded-lg">
                          <div className="bg-white rounded-lg overflow-hidden">
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
                                                <div className="relative p-[1px] bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 rounded-full">
                                                  <Badge variant="secondary" className="text-xs capitalize bg-white text-gray-800 border-0 rounded-full px-2 py-1">
                                                    {profile.user_type}
                                                  </Badge>
                                                </div>
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
                      </div>
                    )}
                  </div>

                  {/* Navigation */}
                  <nav className="grid gap-6 text-lg font-medium mb-8">
                    <Link 
                      href="/service-requests" 
                      className="flex items-center gap-3 text-white hover:text-udaan-orange transition-colors duration-300"
                    >
                      <Award className="h-5 w-5" />
                      <span>Service Requests</span>
                    </Link>

                    <Link 
                      href="/service-offers" 
                      className="flex items-center gap-3 text-white hover:text-udaan-orange transition-colors duration-300"
                    >
                      <Briefcase className="h-5 w-5" />
                      <span>Service Offers</span>
                    </Link>

                    <Link 
                      href="/marketplace" 
                      className="flex items-center gap-3 text-white hover:text-udaan-orange transition-colors duration-300"
                    >
                      <ShoppingBag className="h-5 w-5" />
                      <span>Marketplace</span>
                    </Link>

                    <Link 
                      href="/cart" 
                      className="flex items-center gap-3 text-white hover:text-udaan-orange transition-colors duration-300"
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
                    {user ? (
                      <div>
                        <div className="flex items-center gap-4 mb-6">
                          <Avatar className="h-12 w-12">
                            {user.profile_image && <AvatarImage src={user.profile_image} alt={user.name} />}
                            <AvatarFallback className="bg-udaan-orange text-white font-semibold text-lg">{getInitials(user.name)}</AvatarFallback>
                          </Avatar>
                          <div className="grid gap-1">
                            <p className="text-lg font-medium text-white">{user.name}</p>
                            <p className="text-sm text-gray-300">{user.email}</p>
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
                          <Link href="/orders">
                            <Button variant="outline" className="w-full h-12 text-udaan-navy border-udaan-navy bg-white hover:bg-udaan-orange hover:border-udaan-orange hover:text-white transition-colors">
                              My Orders
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

