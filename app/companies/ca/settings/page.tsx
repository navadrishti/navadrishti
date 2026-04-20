'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CAConsoleHeader } from '@/components/ca-console-header';

export default function CompanyCASettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [context, setContext] = useState<any>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const loadContext = async () => {
      try {
        const response = await fetch('/api/companies/ca/verify', {
          credentials: 'include'
        });
        const payload = await response.json();

        if (!response.ok || !payload?.success) {
          router.push('/companies/ca/login');
          return;
        }

        setContext(payload.company_ca);
      } catch {
        router.push('/companies/ca/login');
      } finally {
        setLoading(false);
      }
    };

    loadContext();
  }, [router]);

  const handleLogout = async () => {
    await fetch('/api/companies/ca/logout', {
      method: 'POST',
      credentials: 'include'
    });
    router.push('/companies/ca/login');
  };

  const handlePasswordChange = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setErrorMessage('Please fill in all password fields.');
      return;
    }

    if (newPassword.length < 8) {
      setErrorMessage('New password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('New passwords do not match.');
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch('/api/companies/ca/change-password', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword
        })
      });
      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        setErrorMessage(payload?.error || 'Password change failed.');
        return;
      }

      setSuccessMessage('Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      setErrorMessage('Password change failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 px-6 py-10">
        <p className="text-center text-slate-700">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <CAConsoleHeader
        title="Company CA Settings"
        subtitle="Manage account details and change password"
        accountName={context?.company?.name || context?.user?.name || 'Company CA'}
        accountEmail={context?.user?.email || 'company-ca@example.com'}
        userId={context?.company_user_id}
        onLogout={handleLogout}
        onChangePassword={() => {
          // no-op if already on settings page
        }}
      />

      <div className="mx-auto max-w-4xl space-y-6 px-6 py-6">
        <Card>
          <CardHeader>
            <CardTitle>Account overview</CardTitle>
            <CardDescription>Company CA identity details and user profile.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-slate-800">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Name</p>
                <p className="text-sm font-medium">{context?.user?.name || context?.company?.name || 'Company CA'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Email</p>
                <p className="text-sm font-medium">{context?.user?.email || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Company</p>
                <p className="text-sm font-medium">{context?.company?.name || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Company CA ID</p>
                <p className="text-sm font-medium">{context?.company_user_id || 'N/A'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Change password</CardTitle>
            <CardDescription>Use a secure new password and save it here.</CardDescription>
          </CardHeader>
          <CardContent>
            {errorMessage ? (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{errorMessage}</div>
            ) : null}
            {successMessage ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{successMessage}</div>
            ) : null}
            <form className="grid gap-4" onSubmit={handlePasswordChange}>
              <div className="grid gap-2">
                <Label htmlFor="company-ca-settings-current-password">Current password</Label>
                <Input
                  id="company-ca-settings-current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="company-ca-settings-new-password">New password</Label>
                <Input
                  id="company-ca-settings-new-password"
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="company-ca-settings-confirm-password">Confirm new password</Label>
                <Input
                  id="company-ca-settings-confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Save new password'}
                </Button>
                <Button variant="outline" onClick={() => router.push('/companies/ca')}>
                  Back to dashboard
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
