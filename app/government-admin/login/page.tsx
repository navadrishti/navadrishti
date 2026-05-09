'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function GovernmentAdminLoginPage() {
  const router = useRouter();
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
      try { sessionStorage.setItem('govt_admin_tab_session', Date.now().toString()); } catch (e) {}
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

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl items-center justify-center">
        <Card className="grid w-full overflow-hidden border-slate-200 bg-white md:grid-cols-[1.05fr_0.95fr]">
          <div className="hidden min-h-full flex-col justify-between bg-slate-900 p-8 text-white md:flex">
            <div className="space-y-4">
              <p className="inline-flex rounded-full border border-white/15 bg-slate-800 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-200">
                Government Admin Access
              </p>
              <h1 className="max-w-md text-4xl font-semibold leading-tight tracking-tight text-white">
                Manage projects, evidence, verification, and reporting.
              </h1>
              <p className="max-w-md text-sm leading-6 text-slate-300">
                Login is controlled centrally. First-time accounts must change their password before entering the dashboard.
              </p>
            </div>

            <div className="grid gap-3 text-sm text-slate-200">
              <div className="rounded-2xl border border-white/10 bg-slate-800 px-4 py-3">Project setup and milestone planning</div>
              <div className="rounded-2xl border border-white/10 bg-slate-800 px-4 py-3">Evidence validation and deviation review</div>
              <div className="rounded-2xl border border-white/10 bg-slate-800 px-4 py-3">District and state monitoring views</div>
            </div>
          </div>

          <div className="flex items-center justify-center p-6 sm:p-10">
            <div className="w-full max-w-md">
              <CardHeader className="px-0 pt-0 text-left">
                <CardTitle className="text-3xl font-semibold tracking-tight text-slate-900">Government Admin Login</CardTitle>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Enter the credentials created by the Navadrishti super admin.
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
                      onChange={(e) => setCredentials((prev) => ({ ...prev, username: e.target.value }))}
                      required
                      disabled={loading}
                      className="h-11 border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus-visible:border-slate-300 focus-visible:ring-slate-200"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-slate-700">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={credentials.password}
                      onChange={(e) => setCredentials((prev) => ({ ...prev, password: e.target.value }))}
                      required
                      disabled={loading}
                      className="h-11 border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus-visible:border-slate-300 focus-visible:ring-slate-200"
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
                    className="h-11 w-full bg-slate-900 text-white hover:bg-slate-800"
                    disabled={loading || !credentials.username || !credentials.password}
                  >
                    {loading ? 'Authenticating...' : 'Sign In'}
                  </Button>
                </form>

                <div className="mt-6 border-t border-slate-200 pt-5">
                  <p className="text-xs leading-5 text-slate-500">
                    Access is restricted and all actions are audited.
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
