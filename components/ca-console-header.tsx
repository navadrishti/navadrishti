'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

interface CAConsoleHeaderProps {
  title?: string;
  subtitle?: string;
  accountName?: string;
  accountEmail?: string;
  userId?: string | number;
  onLogout: () => void;
  onChangePassword?: () => void;
}

export function CAConsoleHeader({
  title = 'Company CA Console',
  subtitle = 'Chartered Accountant verification workspace',
  accountName,
  accountEmail,
  userId,
  onLogout,
  onChangePassword,
}: CAConsoleHeaderProps) {
  const router = useRouter();

  const emailLabel = accountEmail || 'testing@example.com';
  const displayName = accountName || 'Company CA';

  const initials = useMemo(() => {
    const source = accountEmail || accountName || 'CA';
    const words = source.split(/\s+/).filter(Boolean);
    if (words.length === 0) return 'CA';
    if (words.length === 1) return words[0].charAt(0).toUpperCase();
    return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
  }, [accountEmail, accountName]);

  const handleSettings = () => {
    router.push('/companies/ca/settings');
  };

  return (
    <header className="bg-blue-600 border-b border-blue-700 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">{title}</h1>
            {subtitle ? <p className="text-xs text-blue-100 mt-1">{subtitle}</p> : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link href="/companies/ca" className="inline-flex">
              <Button variant="ghost" size="sm" className="text-white hover:bg-blue-700 hover:text-white">
                Dashboard
              </Button>
            </Link>
            <Link href="/companies/ca/history" className="inline-flex">
              <Button variant="ghost" size="sm" className="text-white hover:bg-blue-700 hover:text-white">
                CA History
              </Button>
            </Link>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2 rounded-full border-white/40 bg-blue-600 text-white hover:bg-transparent hover:text-white"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-orange-500 text-white">{initials}</AvatarFallback>
                  </Avatar>
                  <span className="max-w-[140px] truncate text-sm text-white">{emailLabel}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 rounded-md border border-slate-200 bg-white text-slate-900 shadow-lg">
                <div className="px-3 py-3">
                  <p className="text-sm font-semibold text-slate-900">Account info</p>
                  <p className="text-xs text-slate-600 truncate">{displayName}</p>
                  <p className="text-xs text-slate-600 truncate">{emailLabel}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={handleSettings} className="text-slate-900 focus:bg-slate-100">
                  Change Password
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onLogout} className="text-red-600 focus:bg-slate-100">
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </header>
  );
}
