'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Power, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

type NavadrishtCAAccount = {
  id: number;
  ca_id: string;
  username: string;
  display_name: string;
  active: boolean;
  must_change_password: boolean;
  last_login_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

type CaIdGroup = {
  ca_id: string;
  accounts: Array<{ username: string; display_name: string }>;
  createdAt?: string;
};

export function NavadrishtCAManagement() {
  const [accounts, setAccounts] = useState<NavadrishtCAAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    ca_id: '',
    username: '',
    display_name: '',
    password: '',
  });
  const [autoGenerateCaId, setAutoGenerateCaId] = useState(true);
  const [availableCaIds, setAvailableCaIds] = useState<CaIdGroup[]>([]);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAvailableCaIds = async () => {
    try {
      const response = await fetch('/api/admin/ca-credentials?query=unique-ca-ids', { credentials: 'include' });
      const data = await response.json();
      if (data.success) {
        setAvailableCaIds(Array.isArray(data.data) ? data.data : []);
      }
    } catch (error) {
      console.error('Failed to fetch available CA IDs:', error);
    }
  };

  // showForm removed: create form is always visible to match government-admin layout

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/ca-credentials', { credentials: 'include' });
      const data = await response.json();
      if (data.success) {
        setAccounts(Array.isArray(data.data) ? data.data : []);
      }
    } catch (error) {
      toast.error('Failed to fetch CA accounts');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!autoGenerateCaId && !form.ca_id) {
      toast.error('Please select a CA ID for succession or enable auto-generation');
      return;
    }

    if (!form.username || !form.display_name || !form.password) {
      toast.error('Username, display name, and password are required');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch('/api/admin/ca-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ca_id: autoGenerateCaId ? undefined : form.ca_id,
          username: form.username,
          display_name: form.display_name,
          password: form.password,
          auto_generate_ca_id: autoGenerateCaId,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error);
      }

      toast.success(`CA account created successfully with CA ID: ${data.data.ca_id}`);
      setForm({ ca_id: '', username: '', display_name: '', password: '' });
      setAutoGenerateCaId(true);
      fetchAccounts();
    } catch (error: any) {
      toast.error(error.message || 'Failed to create CA account');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, id: number) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleToggleActivation = async (accountId: number, action: 'activate' | 'deactivate') => {
    const confirmed = window.confirm(
      `Are you sure you want to ${action} this CA account? ${
        action === 'deactivate'
          ? 'The account will be disabled but data will be preserved.'
          : 'The account will be reactivated.'
      }`
    );
    if (!confirmed) return;

    try {
      setLoading(true);
      const response = await fetch('/api/admin/ca-credentials', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ accountId, action }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error);
      }

      toast.success(`CA account ${action}d successfully`);
      fetchAccounts();
    } catch (error: any) {
      toast.error(error.message || `Failed to ${action} CA account`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async (accountId: number, username: string) => {
    const confirmed = window.confirm(
      `⚠️  PERMANENTLY DELETE CA account "${username}"?\n\nThis action cannot be undone. All data associated with this account will be permanently removed.`
    );
    if (!confirmed) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/admin/ca-credentials?accountId=${accountId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error);
      }

      toast.success('CA account permanently deleted');
      fetchAccounts();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete CA account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">CA credentials</h1>
            <p className="text-sm text-slate-600">Create, deactivate, reactivate, or permanently delete CA accounts.</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <Card className="border-blue-200/80 bg-white text-slate-900 min-h-[420px]">
              <CardHeader>
                <CardTitle className="text-slate-900">Create CA credential</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">CA ID assignment</p>
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                        <input
                          type="radio"
                          checked={autoGenerateCaId}
                          onChange={() => {
                            setAutoGenerateCaId(true);
                            setForm((prev) => ({ ...prev, ca_id: '' }));
                          }}
                        />
                        Auto-generate CA ID
                      </label>
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                        <input
                          type="radio"
                          checked={!autoGenerateCaId}
                          onChange={() => {
                            setAutoGenerateCaId(false);
                            fetchAvailableCaIds();
                          }}
                        />
                        Use existing CA ID
                      </label>
                    </div>
                    <p className="text-xs text-slate-600">
                      {autoGenerateCaId
                        ? 'A unique CA ID will be generated by the backend.'
                        : 'Select an existing CA ID to continue the same CA data under a new account.'}
                    </p>
                  </div>

                  {!autoGenerateCaId ? (
                    <div className="space-y-2">
                      <Label htmlFor="ca_id_select">Select CA ID</Label>
                      <select
                        id="ca_id_select"
                        value={form.ca_id}
                        onChange={(e) => setForm((prev) => ({ ...prev, ca_id: e.target.value }))}
                        className="h-10 w-full rounded-md border border-blue-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none"
                      >
                        <option value="">-- Choose a CA ID --</option>
                        {availableCaIds.map((group) => (
                          <option key={group.ca_id} value={group.ca_id}>
                            {group.ca_id} ({group.accounts.length} account{group.accounts.length !== 1 ? 's' : ''}: {group.accounts.map((account) => account.username).join(', ')})
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="username">Username</Label>
                      <Input
                        id="username"
                        value={form.username}
                        onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
                        placeholder="CA Username"
                        className="border-blue-200 bg-slate-50 text-slate-900"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="display_name">Display Name</Label>
                      <Input
                        id="display_name"
                        value={form.display_name}
                        onChange={(e) => setForm((prev) => ({ ...prev, display_name: e.target.value }))}
                        placeholder="CA Name"
                        className="border-blue-200 bg-slate-50 text-slate-900"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                      placeholder="Minimum 8 characters"
                      className="border-blue-200 bg-slate-50 text-slate-900"
                    />
                  </div>

                  <Button type="submit" className="w-full bg-blue-600 text-white hover:bg-blue-500" disabled={loading}>
                    {loading ? 'Creating...' : 'Create CA account'}
                  </Button>
                </form>
              </CardContent>
            </Card>

          <Card className="border-blue-200/80 bg-white text-slate-900 min-h-[420px]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-slate-900">Created accounts</CardTitle>
              <Button variant="outline" size="sm" onClick={fetchAccounts} disabled={loading} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-700">
              {accounts.length === 0 ? (
                loading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <Skeleton key={index} className="h-28 w-full" />
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500">No CA accounts created yet.</p>
                )
              ) : (
                accounts.map((account) => (
                  <div key={account.id} className="rounded-lg border border-blue-200 bg-white p-4 transition-shadow hover:shadow-sm">
                    <div className="mb-3 flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <h4 className="font-semibold text-slate-900">{account.display_name}</h4>
                        <p className="mt-0.5 text-sm text-slate-500">{account.username}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                          {account.ca_id}
                        </Badge>
                        <Badge variant="outline" className={`${account.active ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-slate-100 text-slate-600'}`}>
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
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">CA ID</p>
                        <div className="mt-1 flex items-center gap-2">
                          <p className="font-mono font-medium text-slate-900">{account.ca_id}</p>
                          <button
                            onClick={() => copyToClipboard(account.ca_id, account.id)}
                            className="text-slate-400 hover:text-slate-600"
                            title="Copy CA ID"
                            type="button"
                          >
                            {copiedId === account.id ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Password Status</p>
                        <p className={`mt-1 font-medium ${account.must_change_password ? 'text-amber-600' : 'text-emerald-600'}`}>
                          {account.must_change_password ? 'Reset Required' : 'Password Set'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Last Login</p>
                        <p className="mt-1 font-medium text-slate-900">
                          {account.last_login_at ? new Date(account.last_login_at).toLocaleString() : 'Never'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Created</p>
                        <p className="mt-1 font-medium text-slate-900">
                          {account.created_at ? new Date(account.created_at).toLocaleString() : '—'}
                        </p>
                      </div>
                    </div>

                    {/* textual action buttons removed to match government-admin layout; icons in header handle actions */}
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

export default NavadrishtCAManagement;