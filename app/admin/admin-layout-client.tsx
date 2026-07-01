'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
import { ChevronDown, LogOut, Menu, RefreshCw, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export { AdminPortalMain, AdminPortalShell };

const navItems = [
  { label: 'Dashboard', href: '/admin' },
  { label: 'Announcements', href: '/admin/announcements' },
];

interface AdminConsoleHeaderProps {
  accountName?: string;
  onLogout: () => void;
  onRefresh?: () => void;
  onSupport?: () => void;
}

export function AdminConsoleHeader({
  accountName,
  onLogout,
  onRefresh,
  onSupport,
}: AdminConsoleHeaderProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const displayName = accountName || 'Admin';
  const initials = useMemo(() => {
    const words = displayName.split(/\s+/).filter(Boolean);
    if (words.length === 0) return 'A';
    if (words.length === 1) return words[0].charAt(0).toUpperCase();
    return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
  }, [displayName]);

  useEffect(() => {
    return () => {
      if (profileMenuTimeoutRef.current) {
        clearTimeout(profileMenuTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const openProfileMenu = () => {
    if (profileMenuTimeoutRef.current) {
      clearTimeout(profileMenuTimeoutRef.current);
      profileMenuTimeoutRef.current = null;
    }
    setIsProfileMenuOpen(true);
  };

  const closeProfileMenuWithDelay = (delayMs = 220) => {
    if (profileMenuTimeoutRef.current) {
      clearTimeout(profileMenuTimeoutRef.current);
    }
    profileMenuTimeoutRef.current = setTimeout(() => {
      setIsProfileMenuOpen(false);
    }, delayMs);
  };

  const isNavActive = (href: string) => {
    if (href === '/admin/announcements') {
      return pathname.startsWith('/admin/announcements');
    }
    return pathname === '/admin';
  };

  const navLinkClass = (href: string) =>
    cn(
      'block rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
      isNavActive(href) ? 'bg-white/15 text-udaan-orange' : 'text-white hover:bg-white/10 hover:text-udaan-orange'
    );

  const desktopNavLinkClass = (href: string) =>
    cn(
      'whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
      isNavActive(href) ? 'text-udaan-orange' : 'text-white hover:text-udaan-orange'
    );

  const actionButtons = (
    <>
      {onRefresh ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-white hover:bg-white/10 hover:text-udaan-orange"
          onClick={onRefresh}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      ) : null}
      {onSupport ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-white hover:bg-white/10 hover:text-udaan-orange"
          onClick={onSupport}
        >
          Support
        </Button>
      ) : null}
    </>
  );

  return (
    <header className="sticky top-0 z-50 w-full shrink-0 border-b bg-udaan-blue text-white">
      <div className="udaan-container flex h-16 items-center justify-between gap-3 px-4 md:px-6">
        <Link href="/admin" className="flex min-w-0 shrink items-center font-bold text-xl">
          <img src="/photos/logo.svg" alt="Navadrishti" className="h-28 w-28 shrink-0 sm:h-36 sm:w-36" />
        </Link>

        <div className="hidden items-center gap-3 md:flex lg:gap-4">
          <nav className="flex items-center gap-1.5 lg:gap-2">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className={desktopNavLinkClass(item.href)}>
                {item.label}
              </Link>
            ))}
          </nav>

          {actionButtons}

          <div
            onMouseEnter={openProfileMenu}
            onMouseLeave={() => closeProfileMenuWithDelay()}
            className="relative"
          >
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-md bg-transparent px-2.5 text-white transition-colors hover:text-udaan-orange"
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => event.preventDefault()}
            >
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-udaan-orange text-white">{initials}</AvatarFallback>
              </Avatar>
              <span className="hidden max-w-[120px] truncate text-sm font-medium lg:inline">{displayName}</span>
              <ChevronDown className="h-4 w-4 opacity-80" />
            </button>

            {isProfileMenuOpen ? (
              <div className="absolute right-0 top-full mt-2 w-56 rounded-md border bg-white p-1 text-black shadow-lg">
                <div className="px-2 py-1.5 text-sm font-semibold text-gray-900">{displayName}</div>
                <div className="px-2 py-1.5 text-xs text-muted-foreground">Platform administrator</div>
                <div className="my-1 h-px bg-gray-200" />
                <button
                  type="button"
                  className="flex w-full items-center rounded px-2 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                  onClick={onLogout}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Log out
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="md:hidden">
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Open menu</span>
              </Button>
            </SheetTrigger>

            <SheetContent
              side="right"
              className="w-full border-l border-white/10 bg-udaan-blue p-0 text-white sm:max-w-sm [&>button]:hidden"
            >
              <SheetTitle className="sr-only">Admin console menu</SheetTitle>
              <SheetDescription className="sr-only">Navigation and account actions for the admin console</SheetDescription>

              <div className="flex h-full flex-col">
                <div className="flex items-center justify-between border-b border-white/20 px-4 py-3">
                  <Link href="/admin" className="flex items-center" onClick={() => setMobileMenuOpen(false)}>
                    <img src="/photos/logo.svg" alt="Navadrishti" className="h-24 w-24" />
                  </Link>
                  <SheetClose asChild>
                    <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
                      <X className="h-5 w-5" />
                      <span className="sr-only">Close menu</span>
                    </Button>
                  </SheetClose>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                  <div className="mb-6 flex items-center gap-3 rounded-lg border border-white/15 bg-white/10 p-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-udaan-orange text-white">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{displayName}</p>
                      <p className="text-xs text-white/75">Platform administrator</p>
                    </div>
                  </div>

                  <nav className="space-y-1">
                    {navItems.map((item) => (
                      <SheetClose asChild key={item.href}>
                        <Link href={item.href} className={navLinkClass(item.href)}>
                          {item.label}
                        </Link>
                      </SheetClose>
                    ))}
                  </nav>

                  <div className="mt-4 space-y-2">
                    {onRefresh ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-10 w-full justify-start text-white hover:bg-white/10 hover:text-udaan-orange"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          onRefresh();
                        }}
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Refresh
                      </Button>
                    ) : null}
                    {onSupport ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-10 w-full justify-start text-white hover:bg-white/10 hover:text-udaan-orange"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          onSupport();
                        }}
                      >
                        Support
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="border-t border-white/20 p-4">
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-11 w-full justify-start text-red-200 hover:bg-red-500/20 hover:text-white"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onLogout();
                    }}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Log out
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

export default function AdminLayoutClient({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isPublicRoute = pathname === '/admin/login';

  useEffect(() => {
    if (isPublicRoute) return;

    let cancelled = false;

    const checkAccess = async () => {
      try {
        const hasTab =
          typeof window !== 'undefined' && Boolean(sessionStorage.getItem('admin_tab_session'));

        if (!hasTab) {
          if (!cancelled) router.replace('/admin/login');
          return;
        }

        const response = await fetch('/api/admin/verify', {
          method: 'GET',
          credentials: 'include',
        });

        if (!response.ok && !cancelled) {
          router.replace('/admin/login');
        }
      } catch {
        if (!cancelled) router.replace('/admin/login');
      }
    };

    void checkAccess();

    return () => {
      cancelled = true;
    };
  }, [isPublicRoute, pathname, router]);

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex flex-1 flex-col bg-gradient-to-br from-blue-50 to-indigo-100">{children}</div>
      <footer className="mt-auto border-t border-white/10 bg-udaan-blue text-white">
        <div className="udaan-container flex flex-col items-center justify-between gap-3 py-4 text-xs sm:flex-row sm:text-sm">
          <div className="flex flex-wrap items-center justify-center gap-2 text-white/90 sm:justify-start">
            <span>© 2026</span>
            <Image
              src="/photos/small-logo.svg"
              alt="Navadrishti logo"
              width={16}
              height={16}
              className="h-4 w-4"
            />
            <span className="font-medium">Navadrishti Admin Console</span>
          </div>
          <p className="text-center text-white/75 sm:text-right">
            Platform administration, moderation, and support operations
          </p>
        </div>
      </footer>
    </div>
  );
}
