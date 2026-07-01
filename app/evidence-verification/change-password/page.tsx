'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function EvidenceVerificationChangePasswordPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await fetch('/api/evidence-verification/verify', {
          method: 'GET',
          credentials: 'include'
        });

        if (!response.ok) {
          router.push('/evidence-verification/login');
          return;
        }

        const data = await response.json();
        if (!data?.identity?.must_change_password) {
          router.push('/evidence-verification');
        }
      } catch {
        router.push('/evidence-verification/login');
      }
    };

    void checkSession();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (form.newPassword.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }

    if (form.newPassword !== form.confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch('/api/evidence-verification/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          current_password: form.currentPassword,
          new_password: form.newPassword
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Password change failed');
      }

      toast.success('Password updated successfully');
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      router.push('/evidence-verification');
    } catch (err: any) {
      const message = err?.message || 'Password change failed';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-full bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-full max-w-4xl items-center justify-center py-8">
        <Card className="w-full border-slate-200 bg-white">
          <CardHeader>
            <CardTitle className="text-3xl font-semibold tracking-tight text-slate-900">Change Password</CardTitle>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              You must replace the temporary password before accessing your verification dashboard.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Current password</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={form.currentPassword}
                  onChange={(e) => setForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
                  required
                  className="h-11 border-slate-200 bg-slate-50 text-slate-900"
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword">New password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={form.newPassword}
                  onChange={(e) => setForm((prev) => ({ ...prev, newPassword: e.target.value }))}
                  required
                  className="h-11 border-slate-200 bg-slate-50 text-slate-900"
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm new password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={form.confirmPassword}
                  onChange={(e) => setForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                  required
                  className="h-11 border-slate-200 bg-slate-50 text-slate-900"
                  disabled={loading}
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
                disabled={loading}
              >
                {loading ? 'Updating...' : 'Update password'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
