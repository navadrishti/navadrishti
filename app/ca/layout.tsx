"use client";

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

export default function CALayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isLoginRoute = pathname === '/ca/login';
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [caUser, setCaUser] = useState({
    username: 'CA User',
    icai_membership_number: '123456'
  });

  useEffect(() => {
    if (isLoginRoute) {
      setIsLoading(false);
      return;
    }

    const verifyCAAuth = async () => {
      try {
        const response = await fetch('/api/ca/verify', {
          method: 'GET',
          credentials: 'include'
        });

        if (!response.ok) {
          setIsAuthenticated(false);
          router.push('/ca/login');
          return;
        }

        const data = await response.json();
        // If the per-tab session flag is missing, force re-login (cleared on tab close)
        try {
          const hasTab = typeof window !== 'undefined' && sessionStorage.getItem('ca_tab_session');
          if (!hasTab) {
            setIsAuthenticated(false);
            router.push('/ca/login');
            setIsLoading(false);
            return;
          }
        } catch (e) {
          // ignore
        }

        // Handle both new and old response formats
        if (data?.account) {
          setCaUser({
            username: data.account.username || 'CA User',
            icai_membership_number: data.account.display_name || '123456'
          });
        } else if (data?.ca) {
          setCaUser({
            username: data.ca.username || 'CA User',
            icai_membership_number: data.ca.icai_membership_number || '123456'
          });
        }
        setIsAuthenticated(true);
      } catch (error) {
        setIsAuthenticated(false);
        router.push('/ca/login');
      } finally {
        setIsLoading(false);
      }
    };

    verifyCAAuth();
  }, [isLoginRoute, router]);

  const handleLogout = async () => {
    try {
      await fetch('/api/ca/logout', {
        method: 'POST',
        credentials: 'include'
      });
    } catch (error) {
      // Ignore logout API failures and redirect to login.
    } finally {
      setIsAuthenticated(false);
      router.push('/ca/login');
    }
  };

  // Keep login page public while all other CA routes stay protected
  if (isLoginRoute) {
    return <>{children}</>;
  }

  // Show skeleton loaders while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen bg-blue-50">
        {/* Header skeleton */}
        <header className="bg-blue-600 border-b border-blue-700 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center space-x-3">
                <div className="h-6 w-48 bg-blue-400/40 rounded animate-pulse" />
              </div>
              <div className="hidden md:flex items-center space-x-4">
                <div className="h-6 w-24 bg-blue-400/40 rounded animate-pulse" />
                <div className="h-6 w-20 bg-blue-400/40 rounded animate-pulse" />
              </div>
              <div className="flex items-center space-x-4">
                <div className="h-8 w-32 bg-orange-400/60 rounded animate-pulse" />
              </div>
            </div>
          </div>
        </header>

        {/* Main skeleton content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="space-y-6">
            <div className="h-6 w-1/3 bg-slate-200 rounded animate-pulse" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="h-48 bg-white rounded shadow-sm animate-pulse" />
              <div className="h-48 bg-white rounded shadow-sm animate-pulse" />
            </div>
            <div className="h-40 bg-white rounded shadow-sm animate-pulse" />
            <div className="h-20 bg-white rounded shadow-sm animate-pulse" />
          </div>
        </main>

        {/* Footer skeleton */}
        <footer className="bg-blue-600 border-t border-blue-700 mt-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between text-sm text-blue-100">
              <div className="h-4 w-48 bg-blue-400/40 rounded animate-pulse" />
              <div className="h-4 w-32 bg-blue-400/40 rounded animate-pulse" />
            </div>
          </div>
        </footer>
      </div>
    );
  }

  // Don't render content if not authenticated
  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-blue-50">
      {/* CA Console Header */}
      <header className="bg-blue-600 border-b border-blue-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo & Title */}
            <div className="flex items-center space-x-3">
              <div>
                <h1 className="text-xl font-bold text-white">Navadrishti CA Console</h1>
                <p className="text-xs text-blue-100">Chartered Accountant Login Portal</p>
              </div>
            </div>

            {/* Navigation */}
            <nav className="hidden md:flex items-center space-x-4">
              <Link href="/ca">
                <Button variant="ghost" size="sm" className="text-white hover:bg-blue-700 hover:text-white">
                  Dashboard
                </Button>
              </Link>
              <Link href="/ca/cases">
                <Button variant="ghost" size="sm" className="text-white hover:bg-blue-700 hover:text-white">
                  History
                </Button>
              </Link>
            </nav>

            {/* User Info & Logout */}
            <div className="flex items-center space-x-4">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-white">{caUser.username}</p>
                <p className="text-xs text-blue-100">ICAI: {caUser.icai_membership_number}</p>
              </div>
              <Button variant="outline" size="sm" onClick={handleLogout} className="bg-orange-500 text-white border-orange-500 hover:bg-orange-600 hover:border-orange-600 hover:text-white hover:shadow-lg hover:shadow-orange-500/50">
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-blue-600 border-t border-blue-700 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between text-sm text-blue-100">
            <div className="flex items-center gap-2">
              <span>© 2026</span>
              <Image
                src="/photos/small-logo.svg"
                alt="Navadrishti logo"
                width={18}
                height={18}
                className="h-[18px] w-[18px]"
              />
              <p>Navadrishti. CA Verification System.</p>
            </div>
            <div className="flex items-center space-x-1">
              <span>ICAI Empanelled Portal</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
