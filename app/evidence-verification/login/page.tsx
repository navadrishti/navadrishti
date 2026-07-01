'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Loader2, AlertCircle } from 'lucide-react';
import { AuthCardBackRow } from '@/components/header';

export default function EvidenceVerificationLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const checkExistingSession = async () => {
      try {
        const hasTab =
          typeof window !== 'undefined' &&
          Boolean(sessionStorage.getItem('evidence_verification_tab_session'));

        if (!hasTab) return;

        const response = await fetch('/api/evidence-verification/verify', {
          method: 'GET',
          credentials: 'include',
        });

        if (!response.ok) return;

        const data = await response.json().catch(() => ({}));

        if (!cancelled) {
          if (data?.identity?.must_change_password) {
            router.replace('/evidence-verification/change-password');
          } else {
            router.replace('/evidence-verification');
          }
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

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    try {
      setLoading(true);
      const response = await fetch('/api/evidence-verification/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ email, password })
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        setError(payload?.error || 'Login failed');
        return;
      }

      try { sessionStorage.setItem('evidence_verification_tab_session', Date.now().toString()); } catch {}

      if (payload.must_change_password) {
        router.push('/evidence-verification/change-password');
      } else {
        router.push('/evidence-verification');
      }
    } catch {
      setError('Unable to login. Please try again.');
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-3xl font-bold text-gray-900">Evidence Verification Portal</h1>
          <p className="text-gray-600">Sign in to your assigned verification workspace</p>
        </div>

        <Card className="border-2 border-slate-200 shadow-none">
          <CardHeader className="space-y-1">
            <AuthCardBackRow />
            <CardTitle className="text-2xl font-bold text-center">Sign In</CardTitle>
            <CardDescription className="text-center">
              Use the credentials provided by your company or project administrator
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleLogin}>
              {error ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="evidence-portal-email">Email</Label>
                <Input
                  id="evidence-portal-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Enter your email"
                  required
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="evidence-portal-password">Password</Label>
                <Input
                  id="evidence-portal-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  required
                  disabled={loading}
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading || !email || !password}>
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
