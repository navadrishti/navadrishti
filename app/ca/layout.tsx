"use client";

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConsoleFooter } from '@/components/product-brand';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn, finalizeConsoleLogout, hasConsoleTabSession, clearConsoleTabSession } from '@/lib/utils';
import { ProductBrand } from '@/components/product-brand';

const navItems = [
  { label: 'Dashboard', href: '/ca' },
  { label: 'Change Password', href: '/ca/change-password' },
];

export default function CALayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isLoginRoute = pathname === '/ca/login';
  const isChangePasswordRoute = pathname === '/ca/change-password';
  const isPublicRoute = isLoginRoute || isChangePasswordRoute;

  const [ready, setReady] = useState(() => {
    if (isPublicRoute) return true;
    if (typeof window === 'undefined') return false;
    return false;
  });

  useEffect(() => {
    if (isPublicRoute) {
      setReady(true);
      return;
    }

    let cancelled = false;

    const checkAccess = async () => {
      try {
        if (!hasConsoleTabSession('ca_tab_session')) {
          if (!cancelled) router.replace('/ca/login');
          return;
        }

        const response = await fetch('/api/ca/auth/verify', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        });

        if (!response.ok) {
          clearConsoleTabSession('ca_tab_session');
          if (!cancelled) router.replace('/ca/login');
          return;
        }

        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) router.replace('/ca/login');
      }
    };

    void checkAccess();

    return () => {
      cancelled = true;
    };
  }, [isPublicRoute, router]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    await finalizeConsoleLogout({
      logoutUrl: '/api/ca/auth/logout',
      redirectTo: '/ca/login',
      tabSessionKey: 'ca_tab_session',
    });
  };

  const isNavActive = (href: string) => {
    if (href === '/ca/change-password') return pathname.startsWith('/ca/change-password');
    return (
      pathname === '/ca' ||
      pathname.startsWith('/ca/individuals') ||
      pathname.startsWith('/ca/companies') ||
      pathname.startsWith('/ca/ngos')
    );
  };

  const mobileNavLinkClass = (href: string) =>
    cn(
      'block rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
      isNavActive(href) ? 'sidebar-nav-active' : 'text-[#F5F7F8] hover:bg-white/5 hover:text-white'
    );

  const sidebarNavLinkClass = (href: string) =>
    cn(
      'rounded-md px-3 py-2 text-sm font-medium transition-colors',
      isNavActive(href) ? 'sidebar-nav-active' : 'text-[#F5F7F8] hover:bg-white/5 hover:text-white'
    );

  if (isPublicRoute) {
    return <>{children}</>;
  }

  // Blank until auth — avoids sidebar/skeleton flash before login
  if (!ready) {
    return <div className="min-h-screen bg-background" aria-hidden="true" />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <aside
        className="platform-sidebar bg-platform-sidebar fixed inset-y-0 left-0 top-0 z-50 hidden h-dvh w-60 flex-col border-r border-white/10 text-white md:flex"
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="shrink-0 border-b border-white/15 px-4 py-4">
            <ProductBrand href="/ca" nameClassName="text-white" poweredClassName="text-white/75" />
          </div>
          <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className={sidebarNavLinkClass(item.href)}>
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="shrink-0 border-t border-white/15 p-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="w-full border-orange-500 bg-orange-500 text-white hover:border-orange-500 hover:bg-orange-500 hover:text-white"
            >
              Logout
            </Button>
          </div>
        </div>
      </aside>
      <header className="sticky top-0 z-50 w-full shrink-0 border-b bg-platform-sidebar text-white md:hidden">
        <div className="flex h-16 items-center justify-between gap-3 px-4">
          <ProductBrand href="/ca" nameClassName="text-white" poweredClassName="text-white/75" />
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Open menu</span>
              </Button>
            </SheetTrigger>

              <SheetContent
                side="right"
                className="w-full border-l border-white/10 bg-platform-sidebar p-0 text-white sm:max-w-sm [&>button]:hidden"
              >
                <SheetTitle className="sr-only">CA Portal menu</SheetTitle>
                <SheetDescription className="sr-only">
                  Navigation and account actions for the CA console
                </SheetDescription>

                <div className="flex h-full flex-col">
                  <div className="flex items-center justify-between border-b border-white/20 px-4 py-3">
                    <ProductBrand href="/ca" size="sm" nameClassName="text-white" poweredClassName="text-white/75" onClick={() => setMobileMenuOpen(false)} />
                    <SheetClose asChild>
                      <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
                        <X className="h-5 w-5" />
                        <span className="sr-only">Close menu</span>
                      </Button>
                    </SheetClose>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4">
                    <nav className="space-y-1">
                      {navItems.map((item) => (
                        <SheetClose asChild key={item.href}>
                          <Link href={item.href} className={mobileNavLinkClass(item.href)}>
                            {item.label}
                          </Link>
                        </SheetClose>
                      ))}
                    </nav>
                  </div>

                  <div className="border-t border-white/20 p-4">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 w-full border-orange-500 bg-orange-500 text-white hover:border-orange-500 hover:bg-orange-500 hover:text-white"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        void handleLogout();
                      }}
                    >
                      Logout
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
        </div>
      </header>

      <main className="udaan-container w-full flex-1 px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>

      <ConsoleFooter />
    </div>
  );
}
