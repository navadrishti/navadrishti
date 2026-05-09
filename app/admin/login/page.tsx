'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminLoginPage() {
  const router = useRouter();
  const [credentials, setCredentials] = useState({
    username: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
        body: JSON.stringify(credentials)
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('Admin login successful');
        try { sessionStorage.setItem('admin_tab_session', Date.now().toString()); } catch (e) {}
        // Clear form
        setCredentials({ username: '', password: '' });
        setError('');
        // Route to admin panel
        router.push('/admin');
      } else {
        setError(data.error || 'Login failed');
        toast.error(data.error || 'Login failed');
      }
    } catch (error) {
      setError('Network error. Please try again.');
      toast.error('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen overflow-hidden bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl items-center justify-center">
        <Card className="grid w-full overflow-hidden border-blue-100 bg-white md:grid-cols-[1.05fr_0.95fr]">
          <div className="relative hidden min-h-full overflow-hidden bg-blue-600 p-8 text-white md:flex md:flex-col md:justify-between">

            <div className="relative space-y-6">
              <div className="space-y-3">
                <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium tracking-wide text-white/90 backdrop-blur">
                  Admin Command Center
                </p>
                <h1 className="max-w-sm text-4xl font-semibold leading-tight tracking-tight text-white">
                  Sign in to the moderation console.
                </h1>
                <p className="max-w-md text-sm leading-6 text-blue-100">
                  Review offers, manage requests, handle support, and control the platform from one central dashboard.
                </p>
              </div>
            </div>

            <div className="relative grid gap-3 text-sm text-blue-50">
              <div className="rounded-2xl border border-white/15 bg-blue-500/80 px-4 py-3">
                Verified admin access only
              </div>
              <div className="rounded-2xl border border-white/15 bg-blue-500/80 px-4 py-3">
                Secure session cookie login
              </div>
              <div className="rounded-2xl border border-white/15 bg-blue-500/80 px-4 py-3">
                Built for fast moderation workflows
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center p-6 sm:p-10">
            <div className="w-full max-w-md">
              <CardHeader className="px-0 pt-0 text-left">
                <CardTitle className="text-3xl font-semibold tracking-tight text-slate-900">Admin Access</CardTitle>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Enter your credentials to open the admin console.
                </p>
              </CardHeader>

              <CardContent className="px-0 pb-0 pt-4">
                <form onSubmit={handleLogin} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="username" className="text-slate-700">Username</Label>
                    <Input
                      id="username"
                      type="text"
                      value={credentials.username}
                      onChange={(e) => setCredentials(prev => ({
                        ...prev,
                        username: e.target.value
                      }))}
                      required
                      disabled={loading}
                      className="h-11 border-blue-100 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus-visible:border-blue-300 focus-visible:ring-blue-200"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-slate-700">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={credentials.password}
                      onChange={(e) => setCredentials(prev => ({
                        ...prev,
                        password: e.target.value
                      }))}
                      required
                      disabled={loading}
                      className="h-11 border-blue-100 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus-visible:border-blue-300 focus-visible:ring-blue-200"
                    />
                  </div>

                  {error && (
                    <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="h-11 w-full bg-blue-600 text-white hover:bg-blue-500"
                    disabled={loading || !credentials.username || !credentials.password}
                  >
                    {loading ? 'Authenticating...' : 'Sign In'}
                  </Button>
                </form>

                <div className="mt-6 border-t border-blue-100 pt-5">
                  <p className="text-xs leading-5 text-slate-500">
                    This is a restricted admin area. All access attempts are logged and monitored.
                  </p>
                </div>
              </CardContent>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}