'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { PortalLoginShell } from '@/components/portal-login-shell';
import { usePortalLoginRedirect } from '@/hooks/use-portal-login-redirect';

export default function CALoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const checkingAuth = usePortalLoginRedirect({
    verifyUrl: '/api/ca/verify',
    sessionKey: 'ca_tab_session',
    dashboardPath: '/ca',
    changePasswordPath: '/ca/change-password',
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/ca/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('CA login successful');
        try { sessionStorage.setItem('ca_tab_session', Date.now().toString()); } catch {}
        setUsername('');
        setPassword('');
        setError('');

        if (data.must_change_password) {
          router.push('/ca/change-password');
        } else {
          router.push('/ca');
        }
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
    <PortalLoginShell
      portalTitle="CA Console"
      portalSubtitle="Chartered Accountant Verification Portal"
      cardDescription="Enter your credentials to access the CA verification dashboard"
      footerNote="Forgot password? Contact administrator"
    >
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
            value={username}
            onChange={(e) => setUsername(e.target.value)}
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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
          />
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={loading || !username || !password}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Signing in...
            </>
          ) : (
            <>
              <Shield className="mr-2 h-4 w-4" />
              Sign In
            </>
          )}
        </Button>
      </form>
    </PortalLoginShell>
  );
}
