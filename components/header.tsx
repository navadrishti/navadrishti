"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription, SheetClose } from "@/components/ui/sheet"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Award, Bell, Menu, Search, ShoppingBag, ShoppingCart, X, HeartHandshake, GraduationCap, Briefcase, Building, UserCheck, LogIn } from "lucide-react"
import { useCart } from "@/lib/cart-context"
import { VerificationBadge } from "@/components/verification-badge"

export function Header() {
  const { user, logout, refreshUser } = useAuth()
  const { getCartItemCount } = useCart()
  const router = useRouter()
  const cartItemCount = getCartItemCount()
  

  
  const handleLogout = () => {
    logout()
    router.push('/')
  }
  
  // Generate initials for avatar fallback
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
        <Link href="/" className="flex items-center gap-2 font-bold text-xl">
          <HeartHandshake className="h-6 w-6 text-udaan-orange" />
          <span>Navdrishti</span>
        </Link>
        <div className="hidden md:flex md:flex-1 md:items-center md:justify-end md:gap-4 lg:gap-6">
          <nav className="flex items-center gap-4 lg:gap-6">
            {/* Only show Verify People link in the main nav if the user is an NGO */}
            {isNgo && (
              <Link href="/skills/verify" className="flex items-center gap-2 text-sm font-medium udaan-nav-link">
                <UserCheck className="h-4 w-4" />
                Verify People
              </Link>
            )}
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
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search marketplace, resources, services..."
              className="w-64 rounded-full bg-background pl-8 md:w-80 lg:w-96"
            />
          </div>
          
          {user ? (
            <>
              {/* Cart Icon with Badge - Only for logged in users */}
              <Button 
                variant="ghost" 
                size="icon" 
                className="relative text-white hover:bg-white/10"
                onClick={() => router.push('/cart')}
              >
                <ShoppingCart className="h-5 w-5" />
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
              className="relative text-white hover:bg-white/10"
              onClick={() => router.push('/cart')}
            >
              <ShoppingCart className="h-5 w-5" />
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

            <SheetContent side="right" className="bg-udaan-navy border-l border-white/30 w-full p-0">
              <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
              <SheetDescription className="sr-only">
                Access navigation links, search, and user account options
              </SheetDescription>
              
              <div className="flex flex-col h-full">
                {/* Fixed Header */}
                <div className="flex-shrink-0 p-6 border-b border-white/10">
                  <div className="flex items-center justify-between">
                    <Link 
                      href="/" 
                      className="flex items-center gap-2 font-bold text-xl text-white"
                    >
                      <HeartHandshake className="h-6 w-6 text-udaan-orange" />
                      <span>Navdrishti</span>
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
                  {/* Search */}
                  <div className="relative mb-6">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input 
                      type="search" 
                      placeholder="Search marketplace, resources, services..." 
                      className="w-full rounded-full bg-background pl-8" 
                    />
                  </div>

                  {/* Navigation */}
                  <nav className="grid gap-6 text-lg font-medium mb-8">
                    {isNgo && (
                      <Link 
                        href="/skills/verify" 
                        className="flex items-center gap-3 text-white hover:text-udaan-orange transition-colors duration-300"
                      >
                        <UserCheck className="h-5 w-5" />
                        <span>Verify People</span>
                      </Link>
                    )}

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

