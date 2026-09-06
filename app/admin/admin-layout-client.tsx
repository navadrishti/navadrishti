'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { AdminPortalMain, AdminPortalShell } from '@/components/evidence-verification/portal-ui';
import { Menu, RefreshCw, X } from 'lucide-react';
import { cn, finalizeConsoleLogout, hasConsoleTabSession, clearConsoleTabSession } from '@/lib/utils';
import { ProductBrand } from '@/components/product-brand';

export { AdminPortalMain, AdminPortalShell };

const navItems = [
  { label: 'Dashboard', href: '/admin' },
];

const logoutButtonClassName =
  'w-full border-orange-500 bg-orange-500 text-white hover:border-orange-500 hover:bg-orange-500 hover:text-white';

interface AdminConsoleHeaderProps {
  onLogout: () => void;
  onRefresh?: () => void;
  onSupport?: () => void;
}

export function AdminConsoleHeader({
  onLogout,
  onRefresh,
  onSupport,
}: AdminConsoleHeaderProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('nd-mobile-menu-state', { detail: { open: mobileMenuOpen } }));
  }, [mobileMenuOpen]);

  useEffect(() => {
    return () => {
      window.dispatchEvent(new CustomEvent('nd-mobile-menu-state', { detail: { open: false } }));
    };
  }, []);

  const desktopNavClass =
    'inline-flex w-full items-center rounded-md px-3 py-2 text-left text-sm font-medium text-[#F5F7F8] transition-colors hover:bg-white/5 hover:text-white';
  const mobileNavClass =
    'inline-flex w-full items-center rounded-md px-3 py-2.5 text-left text-sm font-medium text-[#F5F7F8] transition-colors hover:bg-white/5 hover:text-white';

  return (
    <>
    <aside
      className="platform-sidebar bg-platform-sidebar fixed inset-y-0 left-0 top-0 z-50 hidden h-dvh w-60 flex-col border-r border-white/10 text-white md:flex"
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 border-b border-white/15 px-4 py-4">
          <ProductBrand href="/admin" nameClassName="text-white" poweredClassName="text-white/75" />
        </div>
        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className={desktopNavClass}>
              {item.label}
            </Link>
          ))}
          {onRefresh ? (
            <button type="button" className={desktopNavClass} onClick={onRefresh}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </button>
          ) : null}
          {onSupport ? (
            <button type="button" className={desktopNavClass} onClick={onSupport}>
              Support
            </button>
          ) : null}
        </nav>
        <div className="shrink-0 border-t border-white/15 p-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onLogout}
            className={logoutButtonClassName}
          >
            Logout
          </Button>
        </div>
      </div>
    </aside>
    <header className="sticky top-0 z-50 w-full border-b bg-platform-sidebar text-white md:hidden">
      <div className="flex h-16 items-center justify-between gap-3 px-4">
        <ProductBrand href="/admin" nameClassName="text-white" poweredClassName="text-white/75" />
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
              <SheetTitle className="sr-only">Admin console menu</SheetTitle>
              <SheetDescription className="sr-only">Navigation and account actions for the admin console</SheetDescription>

              <div className="flex h-full flex-col">
                <div className="flex items-center justify-between border-b border-white/20 px-4 py-3">
                  <ProductBrand href="/admin" size="sm" nameClassName="text-white" poweredClassName="text-white/75" onClick={() => setMobileMenuOpen(false)} />
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
                        <Link href={item.href} className={mobileNavClass}>
                          {item.label}
                        </Link>
                      </SheetClose>
                    ))}
                    {onRefresh ? (
                      <button
                        type="button"
                        className={mobileNavClass}
                        onClick={() => {
                          setMobileMenuOpen(false);
                          onRefresh();
                        }}
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Refresh
                      </button>
                    ) : null}
                    {onSupport ? (
                      <button
                        type="button"
                        className={mobileNavClass}
                        onClick={() => {
                          setMobileMenuOpen(false);
                          onSupport();
                        }}
                      >
                        Support
                      </button>
                    ) : null}
                  </nav>
                </div>

                <div className="border-t border-white/20 p-4">
                  <Button
                    type="button"
                    variant="outline"
                    className={cn('h-11', logoutButtonClassName)}
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onLogout();
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
    </>
  );
}

export default function AdminLayoutClient({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isPublicRoute = pathname === '/admin/login';
  const [ready, setReady] = useState(isPublicRoute);

  useEffect(() => {
    if (isPublicRoute) {
      setReady(true);
      return;
    }

    let cancelled = false;

    const checkAccess = async () => {
      try {
        if (!hasConsoleTabSession('admin_tab_session')) {
          if (!cancelled) router.replace('/admin/login');
          return;
        }

        const response = await fetch('/api/admin/verify', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        });

        if (!response.ok) {
          clearConsoleTabSession('admin_tab_session');
          if (!cancelled) router.replace('/admin/login');
          return;
        }

        if (!cancelled) setReady(true);
      } catch {
        clearConsoleTabSession('admin_tab_session');
        if (!cancelled) router.replace('/admin/login');
      }
    };

    void checkAccess();

    return () => {
      cancelled = true;
    };
  }, [isPublicRoute, pathname, router]);

  if (isPublicRoute) {
    return (
      <div className="flex min-h-screen flex-col">
        <div className="flex flex-1 flex-col bg-background">{children}</div>
      </div>
    );
  }

  if (!ready) {
    return <div className="min-h-screen bg-background" aria-hidden="true" />;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex flex-1 flex-col bg-background">{children}</div>
    </div>
  );
}
