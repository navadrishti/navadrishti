'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { AuthCardBackRow } from '@/components/header';

export default function AdminLoginPage() {
  const router = useRouter();
  const [credentials, setCredentials] = useState({
    username: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const checkExistingSession = async () => {
      try {
        const hasTab =
          typeof window !== 'undefined' && Boolean(sessionStorage.getItem('admin_tab_session'));

        if (!hasTab) return;

        const response = await fetch('/api/admin/verify', {
          method: 'GET',
          credentials: 'include',
        });

        if (!response.ok) return;

        if (!cancelled) {
          router.replace('/admin');
        }
      } catch {
        // ignore — user can sign in manually
      }
    };

    void checkExistingSession();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(credentials)
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('Admin login successful');
        try { sessionStorage.setItem('admin_tab_session', Date.now().toString()); } catch {}
        setCredentials({ username: '', password: '' });
        setError('');
        router.push('/admin');
      } else {
        setError(data.error || 'Login failed');
        toast.error(data.error || 'Login failed');
      }
    } catch {
      setError('Network error. Please try again.');
      toast.error('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-3xl font-bold text-gray-900">Admin Console</h1>
          <p className="text-gray-600">Navadrishti Platform Administration</p>
        </div>

        <Card className="border-2 border-slate-200 shadow-sm">
          <CardHeader className="space-y-1">
            <AuthCardBackRow />
            <CardTitle className="text-center text-2xl font-bold">Sign In</CardTitle>
            <CardDescription className="text-center">
              Enter your credentials to access the admin console
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              {error ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="Enter your username"
                  value={credentials.username}
                  onChange={(e) => setCredentials((prev) => ({
                    ...prev,
                    username: e.target.value
                  }))}
                  required
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={credentials.password}
                  onChange={(e) => setCredentials((prev) => ({
                    ...prev,
                    password: e.target.value
                  }))}
                  required
                  disabled={loading}
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={loading || !credentials.username || !credentials.password}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing In...
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
      </div>
    </div>
  );
}
