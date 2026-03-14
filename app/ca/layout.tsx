'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

export default function CALayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if CA is logged in
    const caToken = localStorage.getItem('ca_token');
    
    if (!caToken) {
      router.push('/ca/login');
    } else {
      setIsAuthenticated(true);
      setIsLoading(false);
    }
  }, [router]);

  // Show loading while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen bg-blue-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto" />
          <p className="mt-4 text-blue-600">Loading CA Console...</p>
        </div>
      </div>
    );
  }

  // Don't render content if not authenticated
  if (!isAuthenticated) {
    return null;
  }

  const handleLogout = () => {
    localStorage.removeItem('ca_token');
    localStorage.removeItem('ca_user');
    router.push('/ca/login');
  };

  return (
    <div className="min-h-screen bg-blue-50">
      {/* CA Console Header */}
      <header className="bg-blue-600 border-b border-blue-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo & Title */}
            <div className="flex items-center space-x-3">
              <div>
                <h1 className="text-xl font-bold text-white">CA Console</h1>
                <p className="text-xs text-blue-100">Chartered Accountant Verification Portal</p>
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
                <p className="text-sm font-medium text-white">CA Demo User</p>
                <p className="text-xs text-blue-100">ICAI: 123456</p>
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
            <p>© 2026 Navadrishti. CA Verification System.</p>
            <div className="flex items-center space-x-1">
              <span>ICAI Empanelled Portal</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
