'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function GovernmentAdminLoginPage() {
  const router = useRouter();
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const checkExistingSession = async () => {
      try {
        const hasTab =
          typeof window !== 'undefined' &&
          Boolean(sessionStorage.getItem('govt_admin_tab_session'));

        if (!hasTab) {
          if (!cancelled) setCheckingAuth(false);
          return;
        }

        const response = await fetch('/api/government-admin/verify', {
          method: 'GET',
          credentials: 'include',
        });

        if (!response.ok) {
          if (!cancelled) setCheckingAuth(false);
          return;
        }

        const data = await response.json().catch(() => ({}));

        if (!cancelled) {
          if (data?.mustChangePassword || data?.account?.must_change_password) {
            router.replace('/government-admin/change-password');
          } else {
            router.replace('/government-admin');
          }
        }
      } catch {
        if (!cancelled) setCheckingAuth(false);
      }
    };

    checkExistingSession();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/government-admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(credentials),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Login failed');
      }

      toast.success('Government admin login successful');
      try { sessionStorage.setItem('govt_admin_tab_session', Date.now().toString()); } catch {}
      setCredentials({ username: '', password: '' });

      if (data.mustChangePassword) {
        router.push('/government-admin/change-password');
      } else {
        router.push('/government-admin');
      }
    } catch (err: any) {
      const message = err?.message || 'Network error. Please try again.';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600" />
          <p className="mt-4 text-blue-600">Checking authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-3xl font-bold text-gray-900">Government Admin Console</h1>
          <p className="text-gray-600">Government Administrator Access Portal</p>
        </div>

        <Card className="border-2 border-slate-200 shadow-none">
          <CardHeader>
            <CardTitle>Sign In</CardTitle>
            <CardDescription>
              Enter the credentials created by the Navadrishti super admin
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  value={credentials.username}
                  onChange={(e) => setCredentials((prev) => ({ ...prev, username: e.target.value }))}
                  required
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={credentials.password}
                  onChange={(e) => setCredentials((prev) => ({ ...prev, password: e.target.value }))}
                  required
                  disabled={loading}
                />
              </div>

              {error ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <Button
                type="submit"
                className="w-full"
                disabled={loading || !credentials.username || !credentials.password}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Authenticating...
                  </>
                ) : (
                  <>
                    <Shield className="mr-2 h-4 w-4" />
                    Sign In
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="mt-6 text-center text-sm text-gray-600">
          <p className="mb-2">Access is restricted and all actions are audited</p>
          <p className="inline-flex items-center gap-2">
            © 2026
            <Image
              src="/photos/small-logo.svg"
              alt="Navadrishti logo"
              width={14}
              height={14}
              className="h-3.5 w-3.5"
            />
            Navadrishti Platform
          </p>
        </div>
      </div>
    </div>
  );
}
