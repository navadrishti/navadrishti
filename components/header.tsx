"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const { user, logout } = useAuth()
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
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>{user.name}</DropdownMenuLabel>
                  <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                    {user.email} • {user.user_type.charAt(0).toUpperCase() + user.user_type.slice(1)}
                  </DropdownMenuLabel>
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
          <Button 
            variant="ghost" 
            size="icon" 
            className="text-white hover:bg-white/10" 
            onClick={() => {
              console.log('Mobile menu button clicked, current state:', isMenuOpen);
              setIsMenuOpen(true);
            }}
          >
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle menu</span>
          </Button>
        </div>
      </div>
      {isMenuOpen && (
        <div className="fixed inset-0 z-[100] bg-udaan-navy md:hidden">
          <div className="h-full flex flex-col">
            <div className="flex h-16 items-center justify-between px-4 border-b border-white/10 flex-shrink-0">
              <Link 
                href="/" 
                className="flex items-center gap-2 font-bold text-xl text-white"
                onClick={() => setIsMenuOpen(false)}
              >
                <HeartHandshake className="h-6 w-6 text-udaan-orange" />
                <span>Navdrishti</span>
              </Link>
              <Button 
                variant="ghost" 
                size="icon" 
                className="text-white hover:bg-white/10" 
                onClick={() => {
                  console.log('Close button clicked');
                  setIsMenuOpen(false);
                }}
              >
                <X className="h-5 w-5" />
                <span className="sr-only">Close menu</span>
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="px-6 py-6">
                <div className="space-y-8">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input type="search" placeholder="Search marketplace, resources, services..." className="w-full rounded-full bg-background pl-8" />
                  </div>
                  <nav className="space-y-6">
                    {/* Only show Verify People link in mobile menu if user is an NGO */}
                    {isNgo && (
                      <Link 
                        href="/skills/verify" 
                        className="flex items-center gap-3 text-lg font-medium text-white hover:text-udaan-orange transition-colors py-3 px-2 rounded-lg hover:bg-white/5"
                        onClick={() => setIsMenuOpen(false)}
                      >
                        <UserCheck className="h-6 w-6" />
                        Verify People
                      </Link>
                    )}
                    <Link 
                      href="/service-requests" 
                      className="flex items-center gap-3 text-lg font-medium text-white hover:text-udaan-orange transition-colors py-3 px-2 rounded-lg hover:bg-white/5"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      <Award className="h-6 w-6" />
                      Service Requests
                    </Link>
                    <Link 
                      href="/service-offers" 
                      className="flex items-center gap-3 text-lg font-medium text-white hover:text-udaan-orange transition-colors py-3 px-2 rounded-lg hover:bg-white/5"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      <Briefcase className="h-6 w-6" />
                      Service Offers
                    </Link>
                    <Link 
                      href="/marketplace" 
                      className="flex items-center gap-3 text-lg font-medium text-white hover:text-udaan-orange transition-colors py-3 px-2 rounded-lg hover:bg-white/5"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      <ShoppingBag className="h-6 w-6" />
                      Marketplace
                    </Link>
                    <Link 
                      href="/cart" 
                      className="flex items-center gap-3 text-lg font-medium text-white hover:text-udaan-orange transition-colors py-3 px-2 rounded-lg hover:bg-white/5"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      <ShoppingCart className="h-6 w-6" />
                      <span>Cart</span>
                      {cartItemCount > 0 && (
                        <span className="bg-udaan-orange text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-medium ml-auto">
                          {cartItemCount > 99 ? '99+' : cartItemCount}
                        </span>
                      )}
                    </Link>
                  </nav>
                  
                  {/* Separator */}
                  <div className="border-t border-white/20"></div>
                  
                  {user ? (
                    <>
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
                <div className="space-y-4">
                  <Link href="/cart" onClick={() => setIsMenuOpen(false)}>
                    <Button variant="outline" className="w-full h-12 text-udaan-navy border-udaan-navy bg-white hover:bg-udaan-orange hover:border-udaan-orange hover:text-white transition-colors relative">
                      <ShoppingCart className="h-4 w-4 mr-2" />
                      Cart
                      {cartItemCount > 0 && (
                        <span className="absolute -top-1 -right-1 bg-udaan-orange text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-medium">
                          {cartItemCount > 99 ? '99+' : cartItemCount}
                        </span>
                      )}
                    </Button>
                  </Link>
                  <Link href="/profile" onClick={() => setIsMenuOpen(false)}>
                    <Button variant="outline" className="w-full h-12 text-udaan-navy border-udaan-navy bg-white hover:bg-udaan-orange hover:border-udaan-orange hover:text-white transition-colors">Profile</Button>
                  </Link>
                  <Link href={getDashboardLink()} onClick={() => setIsMenuOpen(false)}>
                    <Button variant="outline" className="w-full h-12 text-udaan-navy border-udaan-navy bg-white hover:bg-udaan-orange hover:border-udaan-orange hover:text-white transition-colors">Dashboard</Button>
                  </Link>
                  <Link href="/orders" onClick={() => setIsMenuOpen(false)}>
                    <Button variant="outline" className="w-full h-12 text-udaan-navy border-udaan-navy bg-white hover:bg-udaan-orange hover:border-udaan-orange hover:text-white transition-colors">My Orders</Button>
                  </Link>
                  {/* Only show Verify People in mobile menu if user is an NGO */}
                  {isNgo && (
                    <Link href="/skills/verify" onClick={() => setIsMenuOpen(false)}>
                      <Button variant="outline" className="w-full h-12 text-udaan-navy border-udaan-navy bg-white hover:bg-udaan-orange hover:border-udaan-orange hover:text-white transition-colors">Verify People</Button>
                    </Link>
                  )}
                  <Link href="/settings" onClick={() => setIsMenuOpen(false)}>
                    <Button variant="outline" className="w-full h-12 text-udaan-navy border-udaan-navy bg-white hover:bg-udaan-orange hover:border-udaan-orange hover:text-white transition-colors">Settings</Button>
                  </Link>
                  <Button 
                    variant="outline" 
                    className="w-full h-12 text-white border-red-500 bg-red-500 hover:bg-red-600 hover:border-red-600 hover:text-white transition-colors" 
                    onClick={() => {
                      setIsMenuOpen(false);
                      handleLogout();
                    }}
                  >
                    Log out
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-4 mt-8">
                <Link href="/login" onClick={() => setIsMenuOpen(false)}>
                  <Button variant="outline" className="w-full h-12 text-udaan-navy border-udaan-navy bg-white hover:bg-udaan-navy hover:text-white transition-colors">
                    Sign In
                  </Button>
                </Link>
                <Link href="/register" onClick={() => setIsMenuOpen(false)}>
                  <Button className="w-full h-12 bg-udaan-orange hover:bg-udaan-orange/90 border-none text-white transition-colors">
                    Get Started
                  </Button>
                </Link>
              </div>
            )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}

