'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getStatusBadgeClass } from '@/components/dashboard-status';
import { formatStatusLabel } from '@/lib/format-date';
import { isActionableLeadInvitationStatus } from './helpers';
import type { ProjectLeadInvitation } from './types';

interface ProjectLeadInvitationsPanelProps {
  invitations: ProjectLeadInvitation[];
  loading: boolean;
  respondingInviteId: string | null;
  onRefresh: () => void;
  onRespond: (inviteId: string, decision: 'accepted' | 'rejected') => void;
}

export function ProjectLeadInvitationsPanel({
  invitations,
  loading,
  respondingInviteId,
  onRefresh,
  onRespond,
}: ProjectLeadInvitationsPanelProps) {
  return (
    <div className="rounded-md border bg-slate-50 p-4 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold text-slate-900">Project Lead NGO Invitations</p>
          <p className="text-sm text-slate-600">Companies invite your NGO to lead a project they have already taken in.</p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh}>Refresh</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          Loading invitations...
        </div>
      ) : invitations.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground">
          <p className="font-medium">No project lead invitations pending</p>
          <p className="mt-1 text-sm">Lead invites from companies on NGO projects will appear here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {invitations.map((invite) => {
            const actionable = isActionableLeadInvitationStatus(invite.status);
            const busy = respondingInviteId === invite.id;
            return (
              <div key={invite.id} className="rounded-md border bg-white p-3 space-y-2">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="font-semibold">{invite.project_title}</p>
                    <p className="text-sm text-slate-600">Invited by: {invite.company_name}</p>
                    <p className="text-xs text-slate-500">
                      {invite.company_email || 'No email'} • {invite.project_location || 'Location not set'}
                      {invite.project_timeline ? ` • ${invite.project_timeline}` : ''}
                    </p>
                    {invite.note ? <p className="mt-1 text-sm text-slate-600">{invite.note}</p> : null}
                  </div>
                  <Badge variant="outline" className={`w-fit ${getStatusBadgeClass(invite.status)}`}>
                    {formatStatusLabel(invite.status)}
                  </Badge>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => onRespond(invite.id, 'accepted')}
                    disabled={!actionable || busy}
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Accept'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onRespond(invite.id, 'rejected')}
                    disabled={!actionable || busy}
                  >
                    Decline
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
