'use client';

import { readApiError } from '@/lib/user-facing-error';
import { clientAuthHeaders, getClientSessionToken } from '@/lib/client-session';
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import type {
  CompanyCaAccount,
  CompanyCaForm,
  CompanyCaIdSuccessionOption,
  CreatedCompanyCaCredentials,
  EligibleEvidenceVerifierProject,
} from './types';

/** @deprecated Prefer useEvidenceVerifierAccounts — alias retained for gradual migration. */
export function useCompanyCaAccounts(userId: number | undefined, isTabActive: boolean) {
  return useEvidenceVerifierAccounts(userId, isTabActive)
}

export function useEvidenceVerifierAccounts(userId: number | undefined, isTabActive: boolean) {
  const [companyCAAccounts, setCompanyCAAccounts] = useState<CompanyCaAccount[]>([]);
  const [loadingCompanyCAAccounts, setLoadingCompanyCAAccounts] = useState(false);
  const [creatingCompanyCA, setCreatingCompanyCA] = useState(false);
  const [companyCAForm, setCompanyCAForm] = useState<CompanyCaForm>({ name: '', email: '', password: '', ca_id: '', auto_generate_ca_id: true });
  const [formError, setFormError] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [lastCreatedCompanyCA, setLastCreatedCompanyCA] = useState<CreatedCompanyCaCredentials | null>(null);
  const [caResetDialogOpen, setCaResetDialogOpen] = useState(false);
  const [caResetTarget, setCaResetTarget] = useState<CompanyCaAccount | null>(null);
  const [caResetPassword, setCaResetPassword] = useState('');
  const [caResetConfirmPassword, setCaResetConfirmPassword] = useState('');
  const [resettingCaPassword, setResettingCaPassword] = useState(false);
  const [availableCompanyCaIds, setAvailableCompanyCaIds] = useState<CompanyCaIdSuccessionOption[]>([]);
  const [eligibleProjects, setEligibleProjects] = useState<EligibleEvidenceVerifierProject[]>([]);
  const [assignDraftByVerifier, setAssignDraftByVerifier] = useState<Record<string, string>>({});
  const [assigningProjects, setAssigningProjects] = useState(false);
  const [mutatingAssignmentId, setMutatingAssignmentId] = useState<string | null>(null);

  const fetchAvailableCompanyCaIds = async () => {
    try {
      const response = await fetch('/api/evidence-verification/accounts?query=available-ca-ids', {
        credentials: 'include',
        headers: clientAuthHeaders(),
      });
      const data = await response.json();
      if (data.success) {
        setAvailableCompanyCaIds(Array.isArray(data.data) ? data.data : []);
      }
    } catch (error) {
      console.error('Failed to fetch available CA IDs:', error);
    }
  };

  const fetchEligibleProjects = async () => {
    try {
      const response = await fetch('/api/evidence-verification/eligible-projects', {
        credentials: 'include',
        headers: clientAuthHeaders(),
      });
      const payload = await response.json().catch(() => null);
      if (response.ok && payload?.success) {
        setEligibleProjects(Array.isArray(payload.data) ? payload.data : []);
      } else {
        setEligibleProjects([]);
      }
    } catch {
      setEligibleProjects([]);
    }
  };

  useEffect(() => {
    if (!userId || !isTabActive) return;
    void fetchAvailableCompanyCaIds();
    void fetchEligibleProjects();
  }, [userId, isTabActive]);

  const reusableCompanyCaIds = availableCompanyCaIds.filter((entry) => entry.reusable);

  const fetchCompanyCAAccounts = async (options?: { background?: boolean }) => {
    try {
      // Keep the table mounted after mutations so Restore/Remove controls do not flash away.
      if (!options?.background) {
        setLoadingCompanyCAAccounts(true);
      }
      const response = await fetch('/api/evidence-verification/accounts', {
        credentials: 'include',
        headers: clientAuthHeaders(),
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
      if (!options?.background) {
        setLoadingCompanyCAAccounts(false);
      }
    }
  };

  const createCompanyCAAccount = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!companyCAForm.name || !companyCAForm.email || !companyCAForm.password) {
      setFormError('Name, email and password are required.');
      return;
    }

    if (!companyCAForm.auto_generate_ca_id && !companyCAForm.ca_id) {
      setFormError('Please select a CA ID or enable auto-generation.');
      return;
    }

    if (!companyCAForm.auto_generate_ca_id) {
      const selectedCaId = availableCompanyCaIds.find((entry) => entry.ca_id === companyCAForm.ca_id);
      if (!selectedCaId?.reusable) {
        setFormError(
          'Selected CA ID is not available for succession. Deactivate the current holder first, or auto-generate a new CA ID.'
        );
        return;
      }
    }

    try {
      setCreatingCompanyCA(true);
      const token = getClientSessionToken();

      if (!token) {
        toast.error('Please login again to continue.');
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
        toast.error(readApiError(payload, 'Failed to create Evidence Verifier account.'));
        return;
      }

      setLastCreatedCompanyCA({
        email: companyCAForm.email,
        password: companyCAForm.password,
        ca_id: payload.data.identity.ca_id,
      });
      toast.success('Evidence Verifier created. Assign CSR projects before they can review evidence.');
      setCompanyCAForm({ name: '', email: '', password: '', ca_id: '', auto_generate_ca_id: true });
      await Promise.all([
        fetchCompanyCAAccounts({ background: true }),
        fetchAvailableCompanyCaIds(),
        fetchEligibleProjects(),
      ]);
    } catch {
      toast.error('Failed to create Evidence Verifier account.');
    } finally {
      setCreatingCompanyCA(false);
    }
  };

  const saveAssignmentDraft = async (identityId: string) => {
    const projectId = String(assignDraftByVerifier[identityId] || '').trim();
    if (!projectId) return;
    setAssigningProjects(true);
    try {
      const response = await fetch(
        `/api/evidence-verification/accounts/${encodeURIComponent(identityId)}/assignments`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { ...clientAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectIds: [projectId] }),
        }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        toast.error(readApiError(payload, 'Failed to assign project'));
        return;
      }
      setAssignDraftByVerifier((prev) => ({ ...prev, [identityId]: '' }));
      toast.success('Project assigned to Evidence Verifier.');
      await fetchCompanyCAAccounts({ background: true });
    } finally {
      setAssigningProjects(false);
    }
  };

  const setAssignmentStatus = async (
    identityId: string,
    assignmentId: string,
    status: 'active' | 'inactive'
  ) => {
    setMutatingAssignmentId(assignmentId);
    try {
      const response = await fetch(
        `/api/evidence-verification/accounts/${encodeURIComponent(identityId)}/assignments/${encodeURIComponent(assignmentId)}`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { ...clientAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        toast.error(readApiError(payload, 'Failed to update assignment'));
        return;
      }
      toast.success(status === 'active' ? 'Assignment restored.' : 'Assignment removed.');
      await fetchCompanyCAAccounts({ background: true });
    } finally {
      setMutatingAssignmentId(null);
    }
  };

  const activeAssignments = (account: CompanyCaAccount) =>
    (account.assignments ?? []).filter((row) => String(row.status).toLowerCase() === 'active');

  const inactiveAssignments = (account: CompanyCaAccount) =>
    (account.assignments ?? []).filter((row) => String(row.status).toLowerCase() === 'inactive');

  const openCaResetPasswordDialog = (account: CompanyCaAccount) => {
    setCaResetTarget(account);
    setCaResetPassword('');
    setCaResetConfirmPassword('');
    setResetError(null);
    setCaResetDialogOpen(true);
  };

  const closeCaResetPasswordDialog = () => {
    setCaResetDialogOpen(false);
    setCaResetTarget(null);
    setCaResetPassword('');
    setCaResetConfirmPassword('');
    setResetError(null);
  };

  const handleResetCaPassword = async () => {
    if (!caResetTarget?.id) return;

    if (caResetPassword.length < 8) {
      setResetError('Password must be at least 8 characters.');
      return;
    }

    if (caResetPassword !== caResetConfirmPassword) {
      setResetError('Passwords do not match.');
      return;
    }

    try {
      setResettingCaPassword(true);
      setResetError(null);
      const token = getClientSessionToken();
      if (!token) {
        toast.error('Please login again to continue.');
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
        toast.error(readApiError(payload, 'Failed to reset CA password.'));
        return;
      }

      toast.success(
        `Password reset for ${caResetTarget.users?.name || caResetTarget.users?.email || 'Evidence Verifier'}. They must change it on next login.`
      );
      closeCaResetPasswordDialog();
      await fetchCompanyCAAccounts({ background: true });
    } catch {
      toast.error('Failed to reset CA password.');
    } finally {
      setResettingCaPassword(false);
    }
  };

  const updateCompanyCAStatus = async (identityId: string, status: 'active' | 'inactive') => {
    if (!identityId) {
      toast.error('Invalid CA account.');
      return;
    }

    try {
      const token = getClientSessionToken();
      if (!token) {
        toast.error('Please login again to continue.');
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
        toast.error(readApiError(payload, 'Failed to update CA account status.'));
        return;
      }

      toast.success(`Evidence Verifier ${status === 'active' ? 'activated' : 'deactivated'} successfully.`);
      await Promise.all([
        fetchCompanyCAAccounts({ background: true }),
        fetchAvailableCompanyCaIds(),
      ]);
    } catch {
      toast.error('Failed to update Evidence Verifier status.');
    }
  };

  const deleteCompanyCAAccount = async (identityId: string, caName: string) => {
    const confirmed = window.confirm(
      `Permanently delete Evidence Verifier "${caName}"?\n\nThis action cannot be undone. All data associated with this account will be permanently removed.`
    );
    if (!confirmed) return;

    if (!identityId) {
      toast.error('Invalid CA account.');
      return;
    }

    try {
      const token = getClientSessionToken();
      if (!token) {
        toast.error('Please login again to continue.');
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
        toast.error(readApiError(payload, 'Failed to delete CA account.'));
        return;
      }

      toast.success('Evidence Verifier permanently deleted.');
      await fetchCompanyCAAccounts({ background: true });
    } catch {
      toast.error('Failed to delete Evidence Verifier.');
    }
  };

  const activeCompanyCAAccounts = companyCAAccounts.filter((account) => account.status === 'active');
  const inactiveCompanyCAAccounts = companyCAAccounts.filter((account) => account.status !== 'active');

  return {
    companyCAAccounts,
    loadingCompanyCAAccounts,
    activeCompanyCAAccounts,
    inactiveCompanyCAAccounts,
    fetchCompanyCAAccounts,
    fetchAvailableCompanyCaIds,
    reusableCompanyCaIds,
    companyCAForm,
    setCompanyCAForm,
    creatingCompanyCA,
    formError,
    resetError,
    lastCreatedCompanyCA,
    createCompanyCAAccount,
    updateCompanyCAStatus,
    deleteCompanyCAAccount,
    eligibleProjects,
    assignDraftByVerifier,
    setAssignDraftByVerifier,
    assigningProjects,
    mutatingAssignmentId,
    saveAssignmentDraft,
    setAssignmentStatus,
    activeAssignments,
    inactiveAssignments,
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

export type EvidenceVerifierAccountsState = ReturnType<typeof useEvidenceVerifierAccounts>
/** @deprecated Use EvidenceVerifierAccountsState */
export type CompanyCaAccountsState = EvidenceVerifierAccountsState
