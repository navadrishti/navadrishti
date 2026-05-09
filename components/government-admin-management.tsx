'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Copy, Power, Trash2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type GovernmentAdminRole = 'state_officer' | 'district_officer' | 'field_officer';

type GovernmentAdminAccount = {
  id: number;
  government_body_id: number;
  username: string;
  email: string;
  display_name: string;
  role: string;
  active: boolean;
  must_change_password: boolean;
  last_login_at?: string | null;
  created_at?: string;
  government_bodies?: {
    department_name: string;
    state_name: string;
  };
};

type GovernmentBody = {
  id: number;
  department_name: string;
  state_name: string;
};

const emptyForm = {
  role: 'state_officer' as GovernmentAdminRole,
  username: '',
  password: '',
};

type Props = {
  embedded?: boolean;
};

export function GovernmentAdminManagement({ embedded = false }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [accounts, setAccounts] = useState<GovernmentAdminAccount[]>([]);
  const [bodies, setBodies] = useState<GovernmentBody[]>([]);
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [bodyForm, setBodyForm] = useState({
    department_name: '',
    state_name: '',
  });

  const roleLabel = (value: GovernmentAdminRole) => {
    if (value === 'state_officer') return 'State officer';
    if (value === 'district_officer') return 'District officer';
    return 'Field officer';
  };

  const renderRoleLabel = (value: string) => {
    if (value === 'state_officer' || value === 'district_officer' || value === 'field_officer') {
      return roleLabel(value);
    }

    return 'Government admin';
  };

  const roleHelpText =
    form.role === 'field_officer'
      ? 'Field officers can be generated multiple times and tied to different projects.'
      : 'State and district credentials are single-slot. Re-generating updates the existing credential.';

  useEffect(() => {
    const boot = async () => {
      const verifyResponse = await fetch('/api/admin/verify', { credentials: 'include' });
      if (!verifyResponse.ok) {
        router.push('/admin/login');
        return;
      }

      const response = await fetch('/api/admin/government-admins', { credentials: 'include' });
      const data = await response.json();
      if (response.ok && data?.success) {
        setAccounts(Array.isArray(data.accounts) ? data.accounts : []);
        setBodies(Array.isArray(data.bodies) ? data.bodies : []);
      } else {
        setError(data?.error || 'Failed to load government admin accounts');
      }
    };

    boot();
  }, [router]);

  const refreshAccounts = async () => {
    const response = await fetch('/api/admin/government-admins', { credentials: 'include' });
    const data = await response.json();
    if (!response.ok || !data?.success) {
      throw new Error(data?.error || 'Failed to load government admin accounts');
    }
    setAccounts(Array.isArray(data.accounts) ? data.accounts : []);
    setBodies(Array.isArray(data.bodies) ? data.bodies : []);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const response = await fetch('/api/admin/government-admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          role: form.role,
          department_name: bodyForm.department_name,
          state_name: bodyForm.state_name,
          username: form.username,
          password: form.password,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to create government admin account');
      }

      setTemporaryPassword(data.password || '');
      setForm(emptyForm);
      setBodyForm({
        department_name: '',
        state_name: '',
      });
      await refreshAccounts();
      toast.success(data?.action === 'updated' ? 'Government credential updated' : 'Government credential created');
    } catch (err: any) {
      const message = err?.message || 'Failed to create government admin account';
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const copyTemporaryPassword = async () => {
    if (!temporaryPassword) return;
    await navigator.clipboard.writeText(temporaryPassword);
    toast.success('Password copied');
  };

  const handleToggleActivation = async (accountId: number, action: 'activate' | 'deactivate') => {
    const confirmed = window.confirm(
      `Are you sure you want to ${action} this government admin account? ${
        action === 'deactivate'
          ? 'The account will be disabled but data will be preserved.'
          : 'The account will be reactivated.'
      }`
    );
    if (!confirmed) return;

    try {
      setLoading(true);
      const response = await fetch('/api/admin/government-admins', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ accountId, action }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error);
      }

      toast.success(`Government admin account ${action}d successfully`);
      await refreshAccounts();
    } catch (error: any) {
      toast.error(error.message || `Failed to ${action} government admin account`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async (accountId: number, username: string) => {
    const confirmed = window.confirm(
      `⚠️  PERMANENTLY DELETE government admin account "${username}"?\n\nThis action cannot be undone. All data associated with this account will be permanently removed.`
    );
    if (!confirmed) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/admin/government-admins?accountId=${accountId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error);
      }

      toast.success('Government admin account permanently deleted');
      await refreshAccounts();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete government admin account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={embedded ? 'w-full' : 'min-h-screen bg-gradient-to-b from-blue-50 via-slate-50 to-white px-4 py-6 text-slate-900 sm:px-6 lg:px-8'}>
      <div className={embedded ? 'w-full' : 'mx-auto max-w-7xl space-y-6'}>
        {!embedded ? (
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-blue-500">Navadrishti Admin</p>
              <h1 className="text-2xl font-semibold text-slate-900">Government project and officer credentials</h1>
              <p className="text-sm text-slate-600">Create manual project-linked credentials for state, district, and field officers.</p>
            </div>
          </div>
        ) : null}

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className={`grid gap-6 lg:grid-cols-[0.95fr_1.05fr] ${error ? 'mt-4' : ''}`}>
          <Card className="border-blue-200/80 bg-white text-slate-900">
            <CardHeader>
              <CardTitle className="text-slate-900">Create government credential</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Role</p>
                  <select
                    value={form.role}
                    onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value as GovernmentAdminRole }))}
                    className="h-10 w-full rounded-md border border-blue-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none"
                  >
                    <option value="state_officer">State officer</option>
                    <option value="district_officer">District officer</option>
                    <option value="field_officer">Field officer</option>
                  </select>
                  <p className="text-xs text-slate-500">{roleHelpText}</p>
                </div>
                <Input
                  value={bodyForm.department_name}
                  onChange={(e) => setBodyForm((prev) => ({ ...prev, department_name: e.target.value }))}
                  placeholder={form.role === 'field_officer' ? 'Project name' : form.role === 'district_officer' ? 'District name' : 'State office name'}
                  className="border-blue-200 bg-slate-50 text-slate-900"
                />
                <Input value={bodyForm.state_name} onChange={(e) => setBodyForm((prev) => ({ ...prev, state_name: e.target.value }))} placeholder="State name" className="border-blue-200 bg-slate-50 text-slate-900" />
                <Input value={form.username} onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))} placeholder="Username" className="border-blue-200 bg-slate-50 text-slate-900" />
                <Input value={form.password} onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))} type="password" placeholder="Password" className="border-blue-200 bg-slate-50 text-slate-900" />
                <Button type="submit" className="w-full bg-blue-600 text-white hover:bg-blue-500" disabled={saving}>
                  {saving ? 'Saving...' : form.role === 'field_officer' ? 'Create field officer' : 'Generate / update credential'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="border-blue-200/80 bg-white text-slate-900">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-slate-900">Created accounts</CardTitle>
              <Button variant="outline" size="sm" onClick={refreshAccounts} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-700">
              {temporaryPassword ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-emerald-900">Password saved</p>
                      <p className="mt-1 font-mono text-sm text-emerald-900">{temporaryPassword}</p>
                    </div>
                    <Button variant="outline" className="border-emerald-300 bg-white text-emerald-700" onClick={copyTemporaryPassword}>
                      <Copy className="mr-2 h-4 w-4" />
                      Copy
                    </Button>
                  </div>
                </div>
              ) : null}

              {accounts.length === 0 ? (
                <p className="text-slate-500">No government admin accounts yet.</p>
              ) : (
                accounts.map((account) => (
                  <div key={account.id} className="rounded-lg border border-blue-200 bg-white p-4 hover:shadow-sm transition-shadow">
                    <div className="mb-3 flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <h4 className="font-semibold text-slate-900">{account.display_name}</h4>
                        <p className="mt-0.5 text-sm text-slate-500">{account.username}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                          {renderRoleLabel(account.role)}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={`${account.active ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-slate-100 text-slate-600'}`}
                        >
                          {account.active ? 'Active' : 'Inactive'}
                        </Badge>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-slate-500 hover:bg-orange-50 hover:text-orange-600"
                          onClick={() => handleToggleActivation(account.id, account.active ? 'deactivate' : 'activate')}
                          disabled={loading}
                        >
                          <Power className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-slate-500 hover:bg-red-50 hover:text-red-600"
                          onClick={() => handleDeleteAccount(account.id, account.username)}
                          disabled={loading}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="mb-3 h-px bg-slate-100"></div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Scope</p>
                        <p className="mt-1 font-medium text-slate-900">{account.government_bodies?.department_name || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">State</p>
                        <p className="mt-1 font-medium text-slate-900">{account.government_bodies?.state_name || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Password Status</p>
                        <p className={`mt-1 font-medium ${account.must_change_password ? 'text-amber-600' : 'text-emerald-600'}`}>
                          {account.must_change_password ? 'Reset Required' : 'Password Set'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Assignment</p>
                        <p className="mt-1 font-medium text-slate-900">{account.role === 'field_officer' ? 'Project specific' : 'All projects'}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function GovernmentAdminManagementPage() {
  return <GovernmentAdminManagement />;
}