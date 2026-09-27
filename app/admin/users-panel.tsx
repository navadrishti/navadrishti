'use client';

import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { toast as sonnerToast } from 'sonner';
import { PencilLine, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getErrorMessage } from '@/lib/utils';
import {
  getAccountLockUntil,
  getAdminModeration,
  isPermanentlyBannedAccount,
} from '@/lib/auth';
import { ReverificationReviewPanel, UserFullDetails } from './detail-panels';
import { textMatch } from './helpers';
import type { AdminUserItem, ReverificationSummary } from './types';

type UserDraft = Pick<AdminUserItem, 'user_type' | 'verification_status'>;

type ModerationAction = 'suspend' | 'unsuspend' | 'ban' | 'unban' | 'delete';

const emptyUserDraft: UserDraft = {
  user_type: 'individual',
  verification_status: 'unverified',
};

const userTypeOptions = [
  { value: 'individual', label: 'Individual' },
  { value: 'ngo', label: 'NGO' },
  { value: 'company', label: 'Company' },
  { value: 'admin', label: 'Admin' },
];

const verificationStatusOptions = [
  { value: 'unverified', label: 'Unverified' },
  { value: 'pending', label: 'Pending' },
  { value: 'verified', label: 'Verified' },
];

function adminUserVerificationLabel(user: Pick<AdminUserItem, 'verification_status' | 'reverification_pending'>) {
  if (user.reverification_pending) return 'reverification pending';
  const status = String(user.verification_status || 'unverified').toLowerCase();
  if (status === 'verified') return 'verified';
  if (status === 'pending') return 'pending';
  return 'unverified';
}

function adminUserVerificationBadgeClass(label?: string | null) {
  const normalized = String(label || '').toLowerCase();
  if (normalized === 'verified') {
    return 'pointer-events-none border-emerald-200 bg-emerald-100 text-emerald-800 hover:bg-emerald-100';
  }
  if (normalized === 'pending' || normalized === 'reverification pending') {
    return 'pointer-events-none border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100';
  }
  return 'pointer-events-none border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100';
}

function adminUserModerationLabel(user: AdminUserItem) {
  if (isPermanentlyBannedAccount(user)) return 'banned';
  const until = getAccountLockUntil(user);
  if (until) return `suspended until ${until.toISOString().slice(0, 10)}`;
  if (String(user.account_status || '').toLowerCase() === 'suspended') return 'suspended';
  return null;
}

export function useUsersPanelState({ setUsers }: { setUsers: Dispatch<SetStateAction<AdminUserItem[]>> }) {
  const [selectedReverification, setSelectedReverification] = useState<ReverificationSummary | null>(null);
  const [reverificationRejectReason, setReverificationRejectReason] = useState('');
  const [processingReverification, setProcessingReverification] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUserItem | null>(null);
  const [userDraft, setUserDraft] = useState(emptyUserDraft);
  const [savingUser, setSavingUser] = useState(false);
  const [suspendDays, setSuspendDays] = useState('7');
  const [moderatingUser, setModeratingUser] = useState(false);
  const [userQuery, setUserQuery] = useState('');

  const selectUser = async (userItem: AdminUserItem) => {
    setSelectedUser(userItem);
    setUserDraft({
      user_type: userItem.user_type || 'individual',
      verification_status: userItem.verification_status || 'unverified',
    });
    setReverificationRejectReason('');
    setSelectedReverification(null);

    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(userItem.id)}/reverification`, {
        credentials: 'include',
      });
      const data = await response.json();
      if (response.ok && data?.success && data?.reverification) {
        setSelectedReverification(data.reverification);
      }
    } catch {
      // keep list snapshot only
    }
  };

  const refreshReverificationState = async (userId: number) => {
    const [usersResponse, reverificationsResponse] = await Promise.all([
      fetch('/api/admin/users?limit=200', { credentials: 'include' }),
      fetch('/api/admin/reverifications?limit=200', { credentials: 'include' }),
    ]);

    const usersData = await usersResponse.json();
    const reverificationsData = await reverificationsResponse.json();
    const reverificationItems: ReverificationSummary[] = reverificationsResponse.ok && reverificationsData?.success
      ? (Array.isArray(reverificationsData.reverifications) ? reverificationsData.reverifications : [])
      : [];
    const reverificationIds = new Set(reverificationItems.map((item) => item.user_id));

    if (usersResponse.ok && usersData?.success) {
      const nextUsers: AdminUserItem[] = (Array.isArray(usersData.users) ? usersData.users : []).map(
        (item: AdminUserItem) => ({
          ...item,
          reverification_pending: reverificationIds.has(item.id),
        })
      );
      setUsers(nextUsers);
      setSelectedUser((current) =>
        current?.id === userId
          ? nextUsers.find((user) => user.id === userId) || current
          : current
      );
    }

    setSelectedReverification(null);
    setReverificationRejectReason('');
  };

  const handleReverificationAction = async (action: 'approve' | 'reject') => {
    if (!selectedUser) return;

    try {
      setProcessingReverification(true);
      const response = await fetch(`/api/admin/users/${encodeURIComponent(selectedUser.id)}/reverification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action,
          reason: action === 'reject' ? reverificationRejectReason : undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to process reverification');
      }

      sonnerToast.success(data.message || (action === 'approve' ? 'Reverification approved' : 'Reverification rejected'));
      await refreshReverificationState(selectedUser.id);
    } catch (error) {
      sonnerToast.error(getErrorMessage(error) || 'Failed to process reverification');
    } finally {
      setProcessingReverification(false);
    }
  };

  const saveUser = async () => {
    if (!selectedUser) return;

    try {
      setSavingUser(true);
      const response = await fetch(`/api/admin/users/${encodeURIComponent(selectedUser.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(userDraft),
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to update user');
      }

      sonnerToast.success('User updated');
      setSelectedUser({ ...data.data, reverification_pending: selectedUser.reverification_pending });
      setUsers((current) =>
        current.map((item) =>
          item.id === data.data.id
            ? { ...data.data, reverification_pending: item.reverification_pending }
            : item
        )
      );
    } catch (error) {
      sonnerToast.error(getErrorMessage(error) || 'Failed to update user');
    } finally {
      setSavingUser(false);
    }
  };

  const moderateUser = async (action: ModerationAction) => {
    if (!selectedUser) return;

    if (action === 'delete') {
      const confirmed = window.confirm(
        `Delete ${selectedUser.name}? This cannot be undone. Related records may block deletion — use Ban instead if needed.`
      );
      if (!confirmed) return;
    }
    if (action === 'ban') {
      const confirmed = window.confirm(
        `Permanently ban ${selectedUser.name}? The same email and phone will be blocked from registering again.`
      );
      if (!confirmed) return;
    }

    try {
      setModeratingUser(true);
      if (action === 'delete') {
        const response = await fetch(`/api/admin/users/${encodeURIComponent(selectedUser.id)}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        const data = await response.json();
        if (!response.ok || !data?.success) {
          throw new Error(data?.error || 'Failed to delete user');
        }
        sonnerToast.success(data.message || 'Account deleted');
        setUsers((current) => current.filter((item) => item.id !== selectedUser.id));
        setSelectedUser(null);
        return;
      }

      const response = await fetch(`/api/admin/users/${encodeURIComponent(selectedUser.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action,
          days: action === 'suspend' ? Number(suspendDays || 7) : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to update account status');
      }

      sonnerToast.success(data.message || 'Account updated');
      const nextUser = {
        ...data.data,
        reverification_pending: selectedUser.reverification_pending,
      } as AdminUserItem;
      setSelectedUser(nextUser);
      setUsers((current) => current.map((item) => (item.id === nextUser.id ? nextUser : item)));
    } catch (error) {
      sonnerToast.error(getErrorMessage(error) || 'Failed to update account');
    } finally {
      setModeratingUser(false);
    }
  };

  return {
    selectedReverification,
    reverificationRejectReason,
    setReverificationRejectReason,
    processingReverification,
    selectedUser,
    userDraft,
    setUserDraft,
    savingUser,
    suspendDays,
    setSuspendDays,
    moderatingUser,
    userQuery,
    setUserQuery,
    selectUser,
    handleReverificationAction,
    saveUser,
    moderateUser,
  };
}

export type UsersPanelState = ReturnType<typeof useUsersPanelState>;

export function UsersPanel({ users, state }: { users: AdminUserItem[]; state: UsersPanelState }) {
  const {
    selectedReverification,
    reverificationRejectReason,
    setReverificationRejectReason,
    processingReverification,
    selectedUser,
    userDraft,
    setUserDraft,
    savingUser,
    suspendDays,
    setSuspendDays,
    moderatingUser,
    userQuery,
    setUserQuery,
    selectUser,
    handleReverificationAction,
    saveUser,
    moderateUser,
  } = state;

  const filteredUsers = useMemo(() => {
    const query = userQuery.trim();
    if (!query) return users;
    return users.filter((item) => (
      textMatch(item.name, query)
      || textMatch(item.email, query)
      || textMatch(item.user_type, query)
      || textMatch(item.verification_status, query)
      || textMatch(item.city, query)
      || textMatch(item.state_province, query)
      || textMatch(item.id, query)
    ));
  }, [users, userQuery]);

  return (
    <div className="grid h-full min-h-0 gap-6 overflow-x-hidden overflow-y-auto pr-1 xl:grid-cols-[0.85fr_1.15fr]">
      <Card className="border-blue-100 bg-white text-slate-900 min-w-0">
        <CardHeader>
          <CardTitle className="text-slate-900">People</CardTitle>
          <Input
            value={userQuery}
            onChange={(e) => setUserQuery(e.target.value)}
            placeholder="Search user by id, name, email, type, status"
            className="mt-3 border-blue-200 bg-white text-slate-900 placeholder:text-slate-400"
          />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-2xl border border-blue-100 bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-700">Loaded users</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{users.length}</p>
          </div>
          {filteredUsers.map((adminUser) => (
            <button key={adminUser.id} onClick={() => selectUser(adminUser)} className={`w-full rounded-2xl border p-4 text-left transition duration-200 overflow-hidden ${selectedUser?.id === adminUser.id ? 'border-blue-400 bg-blue-50' : 'border-blue-100 bg-white hover:bg-slate-50'}`}>
              <div className="flex items-center justify-between gap-2 min-w-0">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 truncate">{adminUser.name}</p>
                  <p className="text-xs text-slate-500 truncate">{adminUser.email}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {(() => {
                    const verificationLabel = adminUserVerificationLabel(adminUser);
                    return (
                      <Badge className={adminUserVerificationBadgeClass(verificationLabel)}>
                        {verificationLabel}
                      </Badge>
                    );
                  })()}
                  {adminUserModerationLabel(adminUser) ? (
                    <Badge className="pointer-events-none border-rose-200 bg-rose-100 text-rose-800 hover:bg-rose-100">
                      {adminUserModerationLabel(adminUser)}
                    </Badge>
                  ) : null}
                  <span className="text-xs text-slate-500">{adminUser.user_type}</span>
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-500 truncate">{adminUser.city || 'Unknown city'}{adminUser.state_province ? `, ${adminUser.state_province}` : ''}</p>
            </button>
          ))}
          {filteredUsers.length === 0 ? <p className="text-sm text-slate-500">No users match your search.</p> : null}
        </CardContent>
      </Card>

      <Card className="border-blue-100 bg-white text-slate-900 min-w-0">
        <CardHeader>
          <CardTitle className="text-slate-900">People editor</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!selectedUser ? (
            <p className="text-sm text-slate-500">Select a user to edit it.</p>
          ) : (
            <>
              {selectedReverification ? (
                <ReverificationReviewPanel
                  summary={selectedReverification}
                  rejectReason={reverificationRejectReason}
                  onRejectReasonChange={setReverificationRejectReason}
                  onApprove={() => handleReverificationAction('approve')}
                  onReject={() => handleReverificationAction('reject')}
                  processing={processingReverification}
                />
              ) : null}
              <UserFullDetails user={selectedUser} />
              <div className="grid gap-3 md:grid-cols-2">
                <Select value={userDraft.user_type} onValueChange={(value) => setUserDraft((prev) => ({ ...prev, user_type: value as UserDraft['user_type'] }))}>
                  <SelectTrigger className="border-blue-200 bg-white text-slate-900">
                    <SelectValue placeholder="User type" />
                  </SelectTrigger>
                  <SelectContent>
                    {userTypeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={userDraft.verification_status} onValueChange={(value) => setUserDraft((prev) => ({ ...prev, verification_status: value as UserDraft['verification_status'] }))}>
                  <SelectTrigger className="border-blue-200 bg-white text-slate-900">
                    <SelectValue placeholder="Verification status" />
                  </SelectTrigger>
                  <SelectContent>
                    {verificationStatusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button onClick={saveUser} disabled={savingUser || moderatingUser} className="bg-udaan-blue hover:bg-udaan-blue/90"><PencilLine className="mr-2 h-4 w-4" />{savingUser ? 'Saving...' : 'Save changes'}</Button>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Account moderation</p>
                  {adminUserModerationLabel(selectedUser) ? (
                    <p className="mt-2 text-xs font-medium text-rose-700">
                      Current status: {adminUserModerationLabel(selectedUser)}
                      {getAdminModeration(selectedUser.profile_data).reason
                        ? ` · ${getAdminModeration(selectedUser.profile_data).reason}`
                        : ''}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-slate-600">No active suspension or ban.</p>
                  )}
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="w-28">
                    <label className="mb-1 block text-xs text-slate-600">Suspend days</label>
                    <Input
                      type="number"
                      min={1}
                      max={90}
                      value={suspendDays}
                      onChange={(event) => setSuspendDays(event.target.value)}
                      className="border-blue-200 bg-white text-slate-900"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={moderatingUser}
                    className="border-amber-300 bg-white text-amber-800 hover:bg-amber-50"
                    onClick={() => moderateUser('suspend')}
                  >
                    Suspend
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={moderatingUser}
                    className="border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                    onClick={() => moderateUser('unsuspend')}
                  >
                    Clear suspension
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={moderatingUser}
                    className="border-rose-300 bg-white text-rose-700 hover:bg-rose-50"
                    onClick={() => moderateUser('ban')}
                  >
                    Permanently ban
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={moderatingUser}
                    className="border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                    onClick={() => moderateUser('unban')}
                  >
                    Clear ban
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={moderatingUser}
                    onClick={() => moderateUser('delete')}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete account
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
