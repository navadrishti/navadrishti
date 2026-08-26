'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
import { ChevronRight, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProductBrand } from '@/components/product-brand';

const navItems = [
  { label: 'Dashboard', href: '/evidence-verification' },
  { label: 'History', href: '/evidence-verification/history' },
];

export function formatVerifierScopeLabels(context?: {
  ca_id?: string | null;
  company_user_id?: number | null;
}) {
  const parts: string[] = [];
  const caId = String(context?.ca_id ?? '').trim();
  if (caId) parts.push(`CA ID: ${caId}`);
  if (context?.company_user_id) parts.push(`Company ID: ${context.company_user_id}`);
  return parts.join(' • ');
}

interface CAConsoleHeaderProps {
  accountName?: string;
  accountEmail?: string;
  companyName?: string;
  caId?: string | null;
  companyUserId?: number | string | null;
  onLogout: () => void;
}

export function CAConsoleHeader({
  accountName,
  accountEmail,
  companyName,
  caId,
  companyUserId,
  onLogout,
}: CAConsoleHeaderProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const displayName = accountName || companyName || 'Verifier';
  const emailLabel = accountEmail || '';

  const initials = useMemo(() => {
    const source = accountName || accountEmail || 'CA';
    const words = source.split(/\s+/).filter(Boolean);
    if (words.length === 0) return 'CA';
    if (words.length === 1) return words[0].charAt(0).toUpperCase();
    return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
  }, [accountEmail, accountName]);

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
    if (href === '/evidence-verification/history') {
      return pathname.startsWith('/evidence-verification/history');
    }
    return (
      pathname === '/evidence-verification' ||
      (pathname.startsWith('/evidence-verification/') &&
        !pathname.startsWith('/evidence-verification/history') &&
        !pathname.startsWith('/evidence-verification/login') &&
        !pathname.startsWith('/evidence-verification/change-password'))
    );
  };

  const scopeLabel = formatVerifierScopeLabels({
    ca_id: caId,
    company_user_id: companyUserId != null ? Number(companyUserId) : null,
  });

  const navLinkClass = (href: string) =>
    cn(
      'block rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
      isNavActive(href) ? 'bg-white/15 text-udaan-orange' : 'text-white hover:bg-white/10 hover:text-udaan-orange'
    );

  return (
    <>
    <aside
      className="platform-sidebar fixed inset-y-0 left-0 top-0 z-50 hidden h-dvh w-60 flex-col border-r border-white/10 text-white md:flex"
      style={{ backgroundColor: '#0067b9' }}
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 border-b border-white/15 px-4 py-4">
          <ProductBrand href="/evidence-verification" nameClassName="text-white" poweredClassName="text-white/75" />
        </div>
        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isNavActive(item.href) ? 'bg-white/15 text-udaan-orange' : 'text-white hover:bg-white/10 hover:text-udaan-orange'
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="shrink-0 border-t border-white/15 p-3">
          <div
            onMouseEnter={openProfileMenu}
            onMouseLeave={() => closeProfileMenuWithDelay()}
            className="relative"
          >
            <button
              type="button"
              className="inline-flex h-10 w-full items-center gap-2 rounded-md bg-transparent px-2 text-white"
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => event.preventDefault()}
            >
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-udaan-orange text-white">{initials}</AvatarFallback>
              </Avatar>
              <span className="max-w-[148px] truncate text-sm font-medium">{displayName}</span>
              <ChevronRight className={`ml-auto h-4 w-4 opacity-80 transition-transform ${isProfileMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {isProfileMenuOpen ? (
              <div className="absolute left-full bottom-0 z-50 ml-2 w-56 overflow-hidden rounded-md border bg-white p-1 text-black shadow-lg">
                <div className="truncate px-2 py-1.5 text-sm font-semibold text-gray-900">{displayName}</div>
                {emailLabel ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    <span className="truncate">{emailLabel}</span>
                    {companyName ? <span className="block truncate">{companyName}</span> : null}
                    {scopeLabel ? <span className="mt-1 block truncate">{scopeLabel}</span> : null}
                  </div>
                ) : scopeLabel ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    <span className="block truncate">{scopeLabel}</span>
                  </div>
                ) : null}
                <div className="my-1 h-px bg-gray-200" />
                <Link
                  href="/evidence-verification/settings"
                  className="block rounded px-2 py-2 text-sm text-gray-800 hover:bg-gray-100"
                >
                  Settings
                </Link>
                <div className="my-1 h-px bg-gray-200" />
                <button
                  type="button"
                  className="block w-full rounded px-2 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                  onClick={onLogout}
                >
                  Log out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </aside>
    <header className="sticky top-0 z-50 w-full border-b text-white md:hidden" style={{ backgroundColor: '#0067b9' }}>
      <div className="flex h-16 items-center justify-between gap-3 px-4">
        <ProductBrand href="/evidence-verification" nameClassName="text-white" poweredClassName="text-white/75" />
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Open menu</span>
            </Button>
          </SheetTrigger>

            <SheetContent side="right" className="w-full border-l border-white/10 p-0 text-white sm:max-w-sm [&>button]:hidden" style={{ backgroundColor: '#0067b9' }}>
              <SheetTitle className="sr-only">CA Portal menu</SheetTitle>
              <SheetDescription className="sr-only">
                Navigation links and account options for the CA Portal
              </SheetDescription>

              <div className="flex h-full flex-col">
                <div className="flex items-center justify-between border-b border-white/20 px-4 py-3">
                  <ProductBrand
                    href="/evidence-verification"
                    size="sm"
                    nameClassName="text-white"
                    poweredClassName="text-white/75"
                    onClick={() => setMobileMenuOpen(false)}
                  />
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
                      {emailLabel ? <p className="truncate text-xs text-white/75">{emailLabel}</p> : null}
                      {scopeLabel ? <p className="mt-1 truncate text-xs text-white/70">{scopeLabel}</p> : null}
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
                    <SheetClose asChild>
                      <Link href="/evidence-verification/settings" className={navLinkClass('/evidence-verification/settings')}>
                        Settings
                      </Link>
                    </SheetClose>
                  </nav>
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
                    Log out
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
