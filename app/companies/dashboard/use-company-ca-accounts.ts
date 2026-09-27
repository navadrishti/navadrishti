'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type {
  CompanyCaAccount,
  CompanyCaFeedback,
  CompanyCaForm,
  CompanyCaIdSuccessionOption,
  CreatedCompanyCaCredentials,
} from './types';

export function useCompanyCaAccounts(userId: number | undefined, isTabActive: boolean) {
  const [companyCAAccounts, setCompanyCAAccounts] = useState<CompanyCaAccount[]>([]);
  const [loadingCompanyCAAccounts, setLoadingCompanyCAAccounts] = useState(false);
  const [creatingCompanyCA, setCreatingCompanyCA] = useState(false);
  const [companyCAForm, setCompanyCAForm] = useState<CompanyCaForm>({ name: '', email: '', password: '', ca_id: '', auto_generate_ca_id: true });
  const [companyCAFeedback, setCompanyCAFeedback] = useState<CompanyCaFeedback | null>(null);
  const [lastCreatedCompanyCA, setLastCreatedCompanyCA] = useState<CreatedCompanyCaCredentials | null>(null);
  const [caResetDialogOpen, setCaResetDialogOpen] = useState(false);
  const [caResetTarget, setCaResetTarget] = useState<CompanyCaAccount | null>(null);
  const [caResetPassword, setCaResetPassword] = useState('');
  const [caResetConfirmPassword, setCaResetConfirmPassword] = useState('');
  const [resettingCaPassword, setResettingCaPassword] = useState(false);
  const [availableCompanyCaIds, setAvailableCompanyCaIds] = useState<CompanyCaIdSuccessionOption[]>([]);

  const fetchAvailableCompanyCaIds = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch('/api/evidence-verification/accounts?query=available-ca-ids', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.success) {
        setAvailableCompanyCaIds(Array.isArray(data.data) ? data.data : []);
      }
    } catch (error) {
      console.error('Failed to fetch available CA IDs:', error);
    }
  };

  useEffect(() => {
    if (!userId || !isTabActive) return;
    void fetchAvailableCompanyCaIds();
  }, [userId, isTabActive]);

  const reusableCompanyCaIds = availableCompanyCaIds.filter((entry) => entry.reusable);

  const fetchCompanyCAAccounts = async () => {
    try {
      setLoadingCompanyCAAccounts(true);
      const token = localStorage.getItem('token');

      if (!token) {
        setCompanyCAAccounts([]);
        return;
      }

      const response = await fetch('/api/evidence-verification/accounts', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const payload = await response.json();
      if (response.ok && payload?.success) {
        setCompanyCAAccounts(Array.isArray(payload.data) ? payload.data : []);
      } else {
        setCompanyCAAccounts([]);
      }
    } catch (error) {
      console.error('Failed to fetch company CA accounts:', error);
      setCompanyCAAccounts([]);
    } finally {
      setLoadingCompanyCAAccounts(false);
    }
  };

  const createCompanyCAAccount = async (e: FormEvent) => {
    e.preventDefault();
    setCompanyCAFeedback(null);

    if (!companyCAForm.name || !companyCAForm.email || !companyCAForm.password) {
      setCompanyCAFeedback({ type: 'error', message: 'Name, email and password are required.' });
      return;
    }

    if (!companyCAForm.auto_generate_ca_id && !companyCAForm.ca_id) {
      setCompanyCAFeedback({ type: 'error', message: 'Please select a CA ID or enable auto-generation.' });
      return;
    }

    if (!companyCAForm.auto_generate_ca_id) {
      const selectedCaId = availableCompanyCaIds.find((entry) => entry.ca_id === companyCAForm.ca_id);
      if (!selectedCaId?.reusable) {
        setCompanyCAFeedback({
          type: 'error',
          message:
            'Selected CA ID is not available for succession. Deactivate the current holder first, or auto-generate a new CA ID.',
        });
        return;
      }
    }

    try {
      setCreatingCompanyCA(true);
      const token = localStorage.getItem('token');

      if (!token) {
        setCompanyCAFeedback({ type: 'error', message: 'Please login again to continue.' });
        return;
      }

      const response = await fetch('/api/evidence-verification/accounts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: companyCAForm.name,
          email: companyCAForm.email,
          password: companyCAForm.password,
          ca_id: companyCAForm.auto_generate_ca_id ? undefined : companyCAForm.ca_id,
          auto_generate_ca_id: companyCAForm.auto_generate_ca_id
        })
      });

      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        setCompanyCAFeedback({ type: 'error', message: payload?.error || 'Failed to create CA account.' });
        return;
      }

      setLastCreatedCompanyCA({ email: companyCAForm.email, password: companyCAForm.password, ca_id: payload.data.identity.ca_id });
      setCompanyCAFeedback({ type: 'success', message: 'CA account created successfully.' });
      setCompanyCAForm({ name: '', email: '', password: '', ca_id: '', auto_generate_ca_id: true });
      await Promise.all([fetchCompanyCAAccounts(), fetchAvailableCompanyCaIds()]);
    } catch (error) {
      setCompanyCAFeedback({ type: 'error', message: 'Failed to create CA account.' });
    } finally {
      setCreatingCompanyCA(false);
    }
  };

  const openCaResetPasswordDialog = (account: CompanyCaAccount) => {
    setCaResetTarget(account);
    setCaResetPassword('');
    setCaResetConfirmPassword('');
    setCaResetDialogOpen(true);
  };

  const closeCaResetPasswordDialog = () => {
    setCaResetDialogOpen(false);
    setCaResetTarget(null);
    setCaResetPassword('');
    setCaResetConfirmPassword('');
  };

  const handleResetCaPassword = async () => {
    if (!caResetTarget?.id) return;

    if (caResetPassword.length < 8) {
      setCompanyCAFeedback({ type: 'error', message: 'Password must be at least 8 characters.' });
      return;
    }

    if (caResetPassword !== caResetConfirmPassword) {
      setCompanyCAFeedback({ type: 'error', message: 'Passwords do not match.' });
      return;
    }

    try {
      setResettingCaPassword(true);
      setCompanyCAFeedback(null);
      const token = localStorage.getItem('token');
      if (!token) {
        setCompanyCAFeedback({ type: 'error', message: 'Please login again to continue.' });
        return;
      }

      const response = await fetch(`/api/evidence-verification/accounts/${encodeURIComponent(String(caResetTarget.id))}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'reset_password',
          password: caResetPassword,
        }),
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        setCompanyCAFeedback({ type: 'error', message: payload?.error || 'Failed to reset CA password.' });
        return;
      }

      setCompanyCAFeedback({
        type: 'success',
        message: `Password reset for ${caResetTarget.users?.name || caResetTarget.users?.email || 'CA'}. They must change it on next login.`,
      });
      closeCaResetPasswordDialog();
      await fetchCompanyCAAccounts();
    } catch {
      setCompanyCAFeedback({ type: 'error', message: 'Failed to reset CA password.' });
    } finally {
      setResettingCaPassword(false);
    }
  };

  const updateCompanyCAStatus = async (identityId: string, status: 'active' | 'inactive') => {
    setCompanyCAFeedback(null);

    if (!identityId) {
      setCompanyCAFeedback({ type: 'error', message: 'Invalid CA account.' });
      return;
    }

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setCompanyCAFeedback({ type: 'error', message: 'Please login again to continue.' });
        return;
      }

      const response = await fetch(`/api/evidence-verification/accounts/${encodeURIComponent(identityId)}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status })
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        setCompanyCAFeedback({ type: 'error', message: payload?.error || 'Failed to update CA account status.' });
        return;
      }

      setCompanyCAFeedback({ type: 'success', message: `CA account ${status === 'active' ? 'activated' : 'deactivated'} successfully.` });
      await Promise.all([fetchCompanyCAAccounts(), fetchAvailableCompanyCaIds()]);
    } catch {
      setCompanyCAFeedback({ type: 'error', message: 'Failed to update CA account status.' });
    }
  };

  const deleteCompanyCAAccount = async (identityId: string, caName: string) => {
    const confirmed = window.confirm(
      `Permanently delete CA account "${caName}"?\n\nThis action cannot be undone. All data associated with this account will be permanently removed.`
    );
    if (!confirmed) return;

    setCompanyCAFeedback(null);

    if (!identityId) {
      setCompanyCAFeedback({ type: 'error', message: 'Invalid CA account.' });
      return;
    }

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setCompanyCAFeedback({ type: 'error', message: 'Please login again to continue.' });
        return;
      }

      const response = await fetch(`/api/evidence-verification/accounts/${encodeURIComponent(identityId)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        setCompanyCAFeedback({ type: 'error', message: payload?.error || 'Failed to delete CA account.' });
        return;
      }

      setCompanyCAFeedback({ type: 'success', message: 'CA account permanently deleted.' });
      await fetchCompanyCAAccounts();
    } catch {
      setCompanyCAFeedback({ type: 'error', message: 'Failed to delete CA account.' });
    }
  };

  const activeCompanyCAAccounts = companyCAAccounts.filter((account) => account.status === 'active');
  const inactiveCompanyCAAccounts = companyCAAccounts.filter((account) => account.status !== 'active');

  return {
    loadingCompanyCAAccounts,
    activeCompanyCAAccounts,
    inactiveCompanyCAAccounts,
    fetchCompanyCAAccounts,
    fetchAvailableCompanyCaIds,
    reusableCompanyCaIds,
    companyCAForm,
    setCompanyCAForm,
    creatingCompanyCA,
    companyCAFeedback,
    lastCreatedCompanyCA,
    createCompanyCAAccount,
    updateCompanyCAStatus,
    deleteCompanyCAAccount,
    caResetDialogOpen,
    setCaResetDialogOpen,
    caResetTarget,
    caResetPassword,
    setCaResetPassword,
    caResetConfirmPassword,
    setCaResetConfirmPassword,
    resettingCaPassword,
    openCaResetPasswordDialog,
    closeCaResetPasswordDialog,
    handleResetCaPassword,
  };
}

export type CompanyCaAccountsState = ReturnType<typeof useCompanyCaAccounts>;
