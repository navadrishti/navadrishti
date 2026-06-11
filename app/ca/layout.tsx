"use client";

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { PortalAccessGate } from '@/components/portal-access-gate';

export default function CALayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginRoute = pathname === '/ca/login';
  const isChangePasswordRoute = pathname === '/ca/change-password';

  const handleLogout = async () => {
    try {
      await fetch('/api/ca/logout', {
        method: 'POST',
        credentials: 'include'
      });
    } catch {
      // Ignore logout API failures
    } finally {
      try {
        sessionStorage.removeItem('ca_tab_session');
      } catch {
        // Ignore storage access issues
      }
      router.push('/ca/login');
    }
  };

  if (isLoginRoute || isChangePasswordRoute) {
    return <>{children}</>;
  }

  return (
    <PortalAccessGate
      verifyUrl="/api/ca/verify"
      loginPath="/ca/login"
      sessionKey="ca_tab_session"
    >
      <div className="min-h-screen bg-blue-50">
        <header className="sticky top-0 z-50 border-b border-blue-700 bg-blue-600">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex h-16 items-center justify-between">
              <div className="flex items-center space-x-3">
                <div>
                  <h1 className="text-xl font-bold text-white">Navadrishti CA Console</h1>
                  <p className="text-xs text-blue-100">Chartered Accountant Login Portal</p>
                </div>
              </div>

              <nav className="hidden items-center space-x-4 md:flex">
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

              <div className="flex items-center space-x-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLogout}
                  className="border-orange-500 bg-orange-500 text-white hover:border-orange-600 hover:bg-orange-600 hover:text-white hover:shadow-lg hover:shadow-orange-500/50"
                >
                  Logout
                </Button>
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </main>

        <footer className="mt-12 border-t border-blue-700 bg-blue-600">
          <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
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
    </PortalAccessGate>
  );
}
