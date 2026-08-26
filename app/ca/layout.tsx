"use client";

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ConsoleFooter } from '@/components/console-footer';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { ProductBrand } from '@/components/product-brand';

const navItems = [
  { label: 'Dashboard', href: '/ca' },
  { label: 'Change Password', href: '/ca/change-password' },
];

function CADashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-9 w-80 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 w-56" />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {[1, 2, 3].map((column) => (
          <Card key={column} className="flex h-full flex-col">
            <CardHeader className="space-y-2 pb-2">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-3 w-36" />
            </CardHeader>
            <CardContent className="flex-1 space-y-2 px-4 pb-2">
              <div className="h-[20.5rem] space-y-2">
                {[1, 2, 3].map((row) => (
                  <Skeleton key={row} className="h-[6.5rem] rounded-lg" />
                ))}
              </div>
            </CardContent>
            <div className="px-4 pb-4 pt-2">
              <Skeleton className="h-8 w-full" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function CALayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isLoginRoute = pathname === '/ca/login';
  const isChangePasswordRoute = pathname === '/ca/change-password';

  useEffect(() => {
    if (isLoginRoute || isChangePasswordRoute) return;

    let cancelled = false;

    const checkAccess = async () => {
      try {
        const hasTab =
          typeof window !== 'undefined' && Boolean(sessionStorage.getItem('ca_tab_session'));

        if (!hasTab) {
          if (!cancelled) router.replace('/ca/login');
          return;
        }

        const response = await fetch('/api/ca/auth/verify', {
          method: 'GET',
          credentials: 'include',
        });

        if (!response.ok) {
          if (!cancelled) router.replace('/ca/login');
          return;
        }

        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) router.replace('/ca/login');
      }
    };

    checkAccess();

    return () => {
      cancelled = true;
    };
  }, [isChangePasswordRoute, isLoginRoute, router]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    try {
      await fetch('/api/ca/auth/logout', {
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

  if (isLoginRoute || isChangePasswordRoute) {
    return <>{children}</>;
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
        {ready ? children : <CADashboardSkeleton />}
      </main>

      <ConsoleFooter />
    </div>
  );
}
