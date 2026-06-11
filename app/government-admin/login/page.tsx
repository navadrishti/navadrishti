'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Loader2, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PortalLoginShell } from '@/components/portal-login-shell';
import { usePortalLoginRedirect } from '@/hooks/use-portal-login-redirect';

export default function GovernmentAdminLoginPage() {
  const router = useRouter();
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const checkingAuth = usePortalLoginRedirect({
    verifyUrl: '/api/government-admin/verify',
    sessionKey: 'govt_admin_tab_session',
    dashboardPath: '/government-admin',
    changePasswordPath: '/government-admin/change-password',
  });

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
    <PortalLoginShell
      portalTitle="Government Admin Console"
      portalSubtitle="Government Administrator Access Portal"
      cardDescription="Enter the credentials created by the Navadrishti super admin"
      footerNote="Access is restricted and all actions are audited"
    >
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
    </PortalLoginShell>
  );
}
