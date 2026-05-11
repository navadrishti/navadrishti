"use client";

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';

export default function CALayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginRoute = pathname === '/ca/login';

  // Simple logout handler
  const handleLogout = async () => {
    try {
      await fetch('/api/ca/logout', {
        method: 'POST',
        credentials: 'include'
      });
    } catch (error) {
      // Ignore logout API failures
    } finally {
      router.push('/ca/login');
    }
  };

  // Keep login page public - all other CA routes are protected server-side
  if (isLoginRoute) {
    return <>{children}</>;
  }

  // Render CA layout - authentication is handled server-side in page components
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
              <Link href="/ca/change-password">
                <Button variant="ghost" size="sm" className="text-white hover:bg-blue-700 hover:text-white">
                  Change Password
                </Button>
              </Link>
            </nav>

            {/* Logout */}
            <div className="flex items-center space-x-4">
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
/div>
          </div>
        </div>
      </footer>
    </div>
  );
}
