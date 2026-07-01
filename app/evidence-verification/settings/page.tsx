'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CAConsoleHeader, formatVerifierScopeLabels } from '@/components/ca-console-header';
import {
  EvidenceActionRow,
  EvidencePageHeader,
  EvidencePortalContentSkeleton,
  EvidencePortalMain,
  EvidencePortalShell,
  EvidenceSectionCard,
} from '@/components/evidence-verification/portal-ui';

export default function EvidenceVerificationSettingsPage() {
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
        const response = await fetch('/api/evidence-verification/verify', {
          credentials: 'include',
        });
        const payload = await response.json();

        if (!response.ok || !payload?.success) {
          router.push('/evidence-verification/login');
          return;
        }

        setContext(payload.company_ca);
      } catch {
        router.push('/evidence-verification/login');
      } finally {
        setLoading(false);
      }
    };

    void loadContext();
  }, [router]);

  const handleLogout = async () => {
    await fetch('/api/evidence-verification/logout', {
      method: 'POST',
      credentials: 'include',
    });
    router.push('/evidence-verification/login');
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
      const response = await fetch('/api/evidence-verification/change-password', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
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

  const scopeLabels = formatVerifierScopeLabels(context);

  return (
    <EvidencePortalShell>
      <CAConsoleHeader
        accountName={context?.user?.name}
        accountEmail={context?.user?.email}
        companyName={context?.company?.name || context?.company_name}
        caId={context?.ca_id}
        companyUserId={context?.company_user_id}
        onLogout={handleLogout}
      />

      <EvidencePortalMain narrow>
        {loading ? (
          <EvidencePortalContentSkeleton />
        ) : (
          <>
        <EvidencePageHeader
          title="Settings"
          description="Manage your verifier account and password."
          scopeLabels={scopeLabels || undefined}
        />

        <EvidenceSectionCard title="Change password" description="Use a secure new password and save it here.">
          {errorMessage ? (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{errorMessage}</div>
          ) : null}
          {successMessage ? (
            <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              {successMessage}
            </div>
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
            <EvidenceActionRow className="sm:justify-stretch [&>button]:sm:flex-1">
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving...' : 'Save new password'}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.push('/evidence-verification')}>
                Back to dashboard
              </Button>
            </EvidenceActionRow>
          </form>
        </EvidenceSectionCard>
          </>
        )}
      </EvidencePortalMain>
    </EvidencePortalShell>
  );
}
