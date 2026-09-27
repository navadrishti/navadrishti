'use client';

import Link from 'next/link';
import { KeyRound, Power, Trash2 } from 'lucide-react';
import { formatStatusLabel } from '@/lib/format-date';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { CompanyCaAccountsState } from './use-company-ca-accounts';
import type { CompanyCaAccount } from './types';

interface CompanyCaAccountCardProps {
  account: CompanyCaAccount;
  toggleStatus: 'active' | 'inactive';
  showPasswordStatus?: boolean;
  onResetPassword: (account: CompanyCaAccount) => void;
  onUpdateStatus: (identityId: string, status: 'active' | 'inactive') => void;
  onDelete: (identityId: string, caName: string) => void;
}

function CompanyCaAccountCard({
  account,
  toggleStatus,
  showPasswordStatus = false,
  onResetPassword,
  onUpdateStatus,
  onDelete,
}: CompanyCaAccountCardProps) {
  return (
    <div className="rounded-md border bg-slate-50 p-3 text-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-medium text-slate-900">{account.users?.name || 'CA'}</p>
        <Badge variant="outline">{formatStatusLabel(account.status)}</Badge>
      </div>
      <p className="text-slate-600">{account.users?.email || 'No email'}</p>
      {account.ca_id && <p className="mt-1 font-mono text-xs text-slate-500">CA ID: {account.ca_id}</p>}
      {showPasswordStatus && (
        <p className={`mt-1 text-xs font-medium ${account.must_change_password ? 'text-amber-600' : 'text-emerald-600'}`}>
          {account.must_change_password ? 'Password reset required on next login' : 'Password set'}
        </p>
      )}
      <div className="mt-2 flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0 text-slate-500 hover:bg-gram-sage hover:text-udaan-blue"
          onClick={() => onResetPassword(account)}
          title="Reset password"
        >
          <KeyRound className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0 text-slate-500 hover:bg-orange-50 hover:text-orange-600"
          onClick={() => onUpdateStatus(String(account.id ?? ''), toggleStatus)}
        >
          <Power className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0 text-slate-500 hover:bg-red-50 hover:text-red-600"
          onClick={() => onDelete(String(account.id ?? ''), account.users?.name || 'CA')}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

interface CompanyCaTabProps {
  ca: CompanyCaAccountsState;
}

export function CompanyCaTab({ ca }: CompanyCaTabProps) {
  const {
    companyCAForm,
    setCompanyCAForm,
    reusableCompanyCaIds,
    fetchAvailableCompanyCaIds,
    creatingCompanyCA,
    createCompanyCAAccount,
    companyCAFeedback,
    lastCreatedCompanyCA,
    loadingCompanyCAAccounts,
    activeCompanyCAAccounts,
    inactiveCompanyCAAccounts,
    fetchCompanyCAAccounts,
    openCaResetPasswordDialog,
    updateCompanyCAStatus,
    deleteCompanyCAAccount,
  } = ca;

  return (
    <>
      <div className="space-y-4 pt-1">
        <h3 className="font-semibold text-slate-900">CA credentials</h3>
        <p className="mt-1 text-sm text-slate-600">
          Create a CA login for your company CSR projects. Your company CA signs in at the CA Portal (/evidence-verification/login).
        </p>

        <form className="mt-4 space-y-4" onSubmit={createCompanyCAAccount}>
          <div className="space-y-3 rounded-lg border border-slate-200 p-4">
            <p className="text-sm font-medium text-slate-700">CA ID Assignment</p>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <input
                  type="radio"
                  checked={companyCAForm.auto_generate_ca_id}
                  onChange={() => {
                    setCompanyCAForm((prev) => ({ ...prev, auto_generate_ca_id: true, ca_id: '' }));
                  }}
                />
                Auto-generate CA ID
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <input
                  type="radio"
                  checked={!companyCAForm.auto_generate_ca_id}
                  onChange={() => {
                    setCompanyCAForm((prev) => ({ ...prev, auto_generate_ca_id: false }));
                    fetchAvailableCompanyCaIds();
                  }}
                />
                Use existing CA ID
              </label>
            </div>
            <p className="text-xs text-slate-600">
              {companyCAForm.auto_generate_ca_id
                ? 'A unique CA ID will be generated by the backend.'
                : 'Select an existing CA ID to assign the same ID to this new CA account (for succession).'}
            </p>
          </div>

          {!companyCAForm.auto_generate_ca_id && (
            <div className="space-y-2">
              <Label htmlFor="company-ca-id-select">Select CA ID</Label>
              {reusableCompanyCaIds.length === 0 ? (
                <p className="text-xs text-amber-700">
                  No CA IDs are available for succession. Deactivate an existing CA account first, or
                  auto-generate a new CA ID.
                </p>
              ) : (
                <select
                  id="company-ca-id-select"
                  value={companyCAForm.ca_id}
                  onChange={(e) => setCompanyCAForm((prev) => ({ ...prev, ca_id: e.target.value }))}
                  className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm text-slate-900 outline-none"
                >
                  <option value="">-- Select a CA ID --</option>
                  {reusableCompanyCaIds.map((caIdEntry) => (
                    <option key={caIdEntry.ca_id} value={caIdEntry.ca_id}>
                      {caIdEntry.ca_id}
                      {caIdEntry.holder_name ? ` (previously: ${caIdEntry.holder_name})` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="company-ca-name">Name</Label>
              <Input
                id="company-ca-name"
                value={companyCAForm.name}
                onChange={(event) => setCompanyCAForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="CA Name"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="company-ca-email">Email</Label>
              <Input
                id="company-ca-email"
                type="email"
                value={companyCAForm.email}
                onChange={(event) => setCompanyCAForm((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="ca@yourcompany.com"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="company-ca-password">Password</Label>
              <Input
                id="company-ca-password"
                type="password"
                value={companyCAForm.password}
                onChange={(event) => setCompanyCAForm((prev) => ({ ...prev, password: event.target.value }))}
                placeholder="Minimum 8 characters"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button type="submit" disabled={creatingCompanyCA} className="w-full sm:w-auto">
              {creatingCompanyCA ? 'Creating...' : 'Create CA account'}
            </Button>
            <Link href="/evidence-verification/login" className="w-full sm:w-auto">
              <Button type="button" variant="outline" className="h-auto w-full whitespace-normal text-center sm:w-auto">
                Open CA portal
              </Button>
            </Link>
          </div>
        </form>

        {companyCAFeedback && (
          <p className={`mt-3 text-sm ${companyCAFeedback.type === 'success' ? 'text-green-700' : 'text-red-700'}`}>
            {companyCAFeedback.message}
          </p>
        )}

        {lastCreatedCompanyCA && (
          <div className="mt-3 rounded-md bg-green-50 p-3 text-sm text-green-800">
            <p className="font-medium">Generated credentials:</p>
            <p>CA ID: {lastCreatedCompanyCA.ca_id}</p>
            <p>Email: {lastCreatedCompanyCA.email}</p>
            <p>Password: {lastCreatedCompanyCA.password}</p>
            <p className="mt-1">CA portal: /evidence-verification/login</p>
          </div>
        )}
      </div>

      <div className="space-y-3 pt-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h4 className="font-semibold text-slate-900">Active CA accounts</h4>
          <Button variant="outline" size="sm" onClick={fetchCompanyCAAccounts} className="w-full sm:w-auto">Refresh</Button>
        </div>
        {loadingCompanyCAAccounts ? (
          <p className="mt-3 text-sm text-slate-600">Loading accounts...</p>
        ) : activeCompanyCAAccounts.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No active CA accounts.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {activeCompanyCAAccounts.map((account) => (
              <CompanyCaAccountCard
                key={account.id}
                account={account}
                toggleStatus="inactive"
                showPasswordStatus
                onResetPassword={openCaResetPasswordDialog}
                onUpdateStatus={updateCompanyCAStatus}
                onDelete={deleteCompanyCAAccount}
              />
            ))}
          </div>
        )}

        {!loadingCompanyCAAccounts && inactiveCompanyCAAccounts.length > 0 && (
          <div className="mt-5 border-t pt-4">
            <h5 className="font-medium text-slate-900">Inactive CA accounts</h5>
            <div className="mt-3 space-y-2">
              {inactiveCompanyCAAccounts.map((account) => (
                <CompanyCaAccountCard
                  key={account.id}
                  account={account}
                  toggleStatus="active"
                  onResetPassword={openCaResetPasswordDialog}
                  onUpdateStatus={updateCompanyCAStatus}
                  onDelete={deleteCompanyCAAccount}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
