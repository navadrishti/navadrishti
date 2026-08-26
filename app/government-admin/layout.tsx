'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2, LogOut, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ProductBrand } from '@/components/product-brand';
import { cn } from '@/lib/utils';
import {
  getLaunchBlockedRedirectPath,
  isLaunchBlockedPath,
} from '@/lib/access-control';

const navItems = [
  { label: 'Dashboard', href: '/government-admin' },
  { label: 'District analytics', href: '/government-admin/district-dashboard' },
  { label: 'State analytics', href: '/government-admin/state-dashboard' },
];

export default function GovernmentAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const launchBlocked = isLaunchBlockedPath(pathname || '/government-admin');
  const isPublicRoute =
    pathname === '/government-admin/login' ||
    pathname === '/government-admin/change-password';

  useEffect(() => {
    if (!launchBlocked) return;
    router.replace(getLaunchBlockedRedirectPath(pathname || '/government-admin'));
  }, [launchBlocked, pathname, router]);

  useEffect(() => {
    if (launchBlocked || isPublicRoute) return;

    let cancelled = false;

    const checkAccess = async () => {
      try {
        const hasTab =
          typeof window !== 'undefined' &&
          Boolean(sessionStorage.getItem('govt_admin_tab_session'));

        if (!hasTab) {
          if (!cancelled) router.replace('/government-admin/login');
          return;
        }

        const response = await fetch('/api/government-admin/verify', {
          method: 'GET',
          credentials: 'include',
        });

        if (!response.ok) {
          if (!cancelled) router.replace('/government-admin/login');
          return;
        }

        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) router.replace('/government-admin/login');
      }
    };

    checkAccess();

    return () => {
      cancelled = true;
    };
  }, [isPublicRoute, launchBlocked, router]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    await fetch('/api/government-admin/logout', { method: 'POST', credentials: 'include' });
    try {
      sessionStorage.removeItem('govt_admin_tab_session');
    } catch {
      // Ignore storage access issues
    }
    router.push('/government-admin/login');
  };

  const isNavActive = (href: string) => {
    if (href === '/government-admin') return pathname === '/government-admin';
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const navLinkClass = (href: string) =>
    cn(
      'rounded-md px-3 py-2 text-sm font-medium transition-colors',
      isNavActive(href) ? 'sidebar-nav-active' : 'text-[#F5F7F8] hover:bg-white/5 hover:text-white'
    );

  if (launchBlocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600" />
          <p className="mt-4 text-blue-600">Redirecting...</p>
        </div>
      </div>
    );
  }

  if (isPublicRoute) {
    return <>{children}</>;
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600" />
          <p className="mt-4 text-blue-600">Checking authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <aside
        className="platform-sidebar bg-platform-sidebar fixed inset-y-0 left-0 top-0 z-50 hidden h-dvh w-60 flex-col border-r border-white/10 text-white md:flex"
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="shrink-0 border-b border-white/15 px-4 py-4">
            <ProductBrand href="/government-admin" nameClassName="text-white" poweredClassName="text-white/75" />
          </div>
          <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className={navLinkClass(item.href)}>
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
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </aside>
      <header className="sticky top-0 z-50 w-full border-b bg-platform-sidebar text-white md:hidden">
        <div className="flex h-16 items-center justify-between px-4">
          <ProductBrand href="/government-admin" nameClassName="text-white" poweredClassName="text-white/75" />
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Open menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full border-l border-white/10 bg-platform-sidebar p-0 text-white sm:max-w-sm [&>button]:hidden">
              <SheetTitle className="sr-only">Government admin menu</SheetTitle>
              <SheetDescription className="sr-only">Navigation and account actions</SheetDescription>
              <div className="flex h-full flex-col">
                <div className="flex items-center justify-between border-b border-white/20 px-4 py-3">
                  <ProductBrand href="/government-admin" size="sm" nameClassName="text-white" poweredClassName="text-white/75" onClick={() => setMobileMenuOpen(false)} />
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
                        <Link href={item.href} className={navLinkClass(item.href)}>
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
                    <LogOut className="mr-2 h-4 w-4" />
                    Logout
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>
      {children}
    </>
  );
}
