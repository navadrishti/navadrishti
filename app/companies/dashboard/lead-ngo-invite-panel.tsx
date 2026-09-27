'use client';

import Link from 'next/link';
import { VerifiedAccountName } from '@/components/verification-badge';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { getGramAvatarFallbackStyle } from '@/lib/gram-avatar';
import { resolveProjectCsrCoverageEndDate } from '@/lib/auth';
import { getStatusBadgeClass } from '@/components/dashboard-status';
import type { CSRTrackingAssignment } from '@/components/csr-tracking-project-details';
import { formatLeadNgoInviteStatusLabel, getInitials, isRemovableLeadInviteStatus } from './format';
import type { LeadNgoInvite, NgoDirectoryItem } from './types';

interface LeadNgoInvitePanelProps {
  assignment: CSRTrackingAssignment;
  ngoDirectory: NgoDirectoryItem[];
  loadingNgoDirectory: boolean;
  searchValue: string;
  onSearchChange: (value: string) => void;
  allVerified: boolean;
  invitingProjectId: string | null;
  onInvite: (projectId: string, ngoIds: number[]) => void;
  onRevokeInvite: (projectId: string, ngoId: number) => void;
}

export function LeadNgoInvitePanel({
  assignment,
  ngoDirectory,
  loadingNgoDirectory,
  searchValue,
  onSearchChange,
  allVerified,
  invitingProjectId,
  onInvite,
  onRevokeInvite,
}: LeadNgoInvitePanelProps) {
  const term = String(searchValue || '').toLowerCase().trim();
  const inviteEntries: Array<[number, LeadNgoInvite]> = (assignment.lead_ngo_invites || [])
    .map((invite) => [Number(invite.ngo_id), invite] as [number, LeadNgoInvite])
    .filter(([ngoId]) => Number.isFinite(ngoId) && ngoId > 0);

  const inviteByNgoId = new Map<number, LeadNgoInvite>(inviteEntries);

  const workEnd = resolveProjectCsrCoverageEndDate({
    valid_until: assignment.project_valid_until,
    timeline: assignment.project_timeline,
  });
  const availableNgos = ngoDirectory
    .filter((ngo) => ngo.id !== Number(assignment.lead_ngo_id))
    .filter((ngo) => {
      if (!workEnd) return false;
      const expiry = String(ngo.csr1_valid_until || '').trim();
      return Boolean(expiry) && expiry >= workEnd;
    });

  const suggestedNgos = availableNgos.slice(0, 4);
  const suggestedIds = new Set(suggestedNgos.map((ngo) => ngo.id));
  const invitedNgosNotInSuggested = inviteEntries
    .filter(([ngoId]) => !suggestedIds.has(ngoId))
    .map(([ngoId, invite]) => {
      const fromDirectory = availableNgos.find((item) => item.id === ngoId);
      return {
        id: ngoId,
        name: String(invite.ngo_name || fromDirectory?.name || 'NGO'),
        email: invite.ngo_email || fromDirectory?.email,
        verification_status:
          invite.ngo_verification_status ||
          fromDirectory?.verification_status ||
          null,
      } satisfies NgoDirectoryItem;
    });
  const displaySuggestedNgos = [...invitedNgosNotInSuggested, ...suggestedNgos].filter(
    (ngo, index, list) => list.findIndex((item) => item.id === ngo.id) === index
  );
  const matchedNgos = term
    ? availableNgos.filter((ngo) =>
        String(ngo.name || '').toLowerCase().includes(term) ||
        String(ngo.email || '').toLowerCase().includes(term)
      )
    : [];

  const renderNgoRow = (ngo: NgoDirectoryItem) => {
    const inviteRecord = inviteByNgoId.get(ngo.id);
    const inviteStatus = String(inviteRecord?.status || '').toLowerCase();
    const alreadyInvited = !!inviteRecord;
    const canRemove = alreadyInvited && isRemovableLeadInviteStatus(inviteStatus) && !inviteRecord?.selected_as_lead;
    const busy = invitingProjectId === assignment.project_id;

    return (
      <div key={`${assignment.project_id}-${ngo.id}`} className="flex items-center justify-between gap-3 rounded-md border bg-white p-3 hover:bg-gram-soft transition-colors">
        <Link href={`/profile/${ngo.id}`} target="_blank" className="flex min-w-0 items-center gap-3 no-underline">
          <Avatar className="h-9 w-9">
            <AvatarFallback
              className="text-xs font-semibold"
              style={getGramAvatarFallbackStyle(ngo.name || 'NGO')}
            >
              {getInitials(ngo.name || 'NGO')}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <VerifiedAccountName
              name={ngo.name}
              status={
                inviteRecord?.ngo_verification_status ||
                ngo.verification_status
              }
              verified={inviteRecord?.ngo_verified}
              size="xs"
              nameClassName="truncate text-sm font-medium text-slate-900"
              className="max-w-full"
            />
            <p className="truncate text-xs text-slate-500">{ngo.email || 'No email'}</p>
          </div>
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          {inviteRecord?.selected_as_lead ? (
            <Badge variant="secondary">Lead NGO</Badge>
          ) : null}
          {alreadyInvited ? (
            <Badge variant="outline" className={getStatusBadgeClass(inviteStatus)}>
              {formatLeadNgoInviteStatusLabel(inviteStatus)}
            </Badge>
          ) : null}
          {canRemove ? (
            <Button
              size="sm"
              variant="outline"
              className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
              disabled={busy}
              onClick={() => onRevokeInvite(assignment.project_id, ngo.id)}
            >
              {busy ? 'Updating...' : 'Remove'}
            </Button>
          ) : !alreadyInvited ? (
            <Button
              size="sm"
              variant="outline"
              disabled={!allVerified || busy}
              onClick={() => onInvite(assignment.project_id, [ngo.id])}
            >
              {busy ? 'Inviting...' : 'Invite'}
            </Button>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-md border bg-slate-50 p-3 space-y-3">
      <p className="text-sm font-medium text-slate-900">Invite Lead NGOs</p>

      <Input
        placeholder="Search NGOs by name or email"
        value={searchValue}
        onChange={(event) => onSearchChange(event.target.value)}
      />

      {loadingNgoDirectory ? (
        <p className="text-xs text-slate-600">Loading NGO directory...</p>
      ) : availableNgos.length === 0 ? (
        <p className="text-xs text-slate-500">No NGOs available to suggest right now.</p>
      ) : (
        <div className="space-y-3">
          {!term && displaySuggestedNgos.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-600">Suggested NGOs</p>
              <div className="space-y-2">{displaySuggestedNgos.slice(0, 5).map(renderNgoRow)}</div>
            </div>
          ) : null}

          {term ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-600">Search Results ({matchedNgos.length})</p>
              {matchedNgos.length > 0 ? (
                <div className="max-h-64 space-y-2 overflow-auto">{matchedNgos.map(renderNgoRow)}</div>
              ) : (
                <p className="text-xs text-slate-500">No NGOs found for "{searchValue}"</p>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
