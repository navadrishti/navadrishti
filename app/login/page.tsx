'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { smoothNavigate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthCardBackRow } from '@/components/header';
import { ProductCopyright } from '@/components/product-brand';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login, clearError, user } = useAuth();
  const router = useRouter();

  const getDashboardRoute = useCallback((current: typeof user) => {
    if (!current) return '/';
    const profileRole = String(current.profile_data?.role || '').toLowerCase();
    if (current.is_company_employee || profileRole === 'company_employee') {
      return current.must_change_password
        ? '/employees/change-password'
        : '/employees/dashboard';
    }
    if (current.user_type === 'ngo') return '/ngos/dashboard';
    if (current.user_type === 'company') return '/companies/dashboard';
    return '/individuals/dashboard';
  }, []);

  useEffect(() => {
    if (user) {
      smoothNavigate(router, getDashboardRoute(user), {
        delay: 200,
      });
    }
  }, [user, router, getDashboardRoute]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    if (!email || !password) {
      return;
    }

    setSubmitting(true);
    try {
      await login(email, password);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-[#F6F5F1] to-[#FFF6ED] p-4">
      <Card className="w-full max-w-md shadow-none">
        <CardHeader className="space-y-1">
          <AuthCardBackRow />
          <CardTitle className="text-2xl font-bold text-center">Sign In</CardTitle>
          <CardDescription className="text-center">
            Enter your email and password to access your account
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="focus:ring-0 focus:ring-offset-0"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  href="/forgot-password"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="focus:ring-0 focus:ring-offset-0"
              />
            </div>
          </CardContent>

          <CardFooter className="flex flex-col space-y-4">
            <Button
              type="submit"
              className="w-full"
              disabled={submitting}
            >
              {submitting ? 'Signing In...' : 'Sign In'}
            </Button>

            <div className="text-center text-sm">
              Don&apos;t have an account?{' '}
              <Link href="/register" className="font-medium text-primary hover:underline">
                Create one
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>

      <div className="mt-6">
        <ProductCopyright />
      </div>
    </div>
  );
}
