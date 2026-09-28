'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { VerifiedAccountName } from '@/components/verification-badge';
import { getStatusBadgeClass } from '@/components/dashboard-status';
import { formatStatusLabel } from '@/lib/format-date';
import { isActionableLeadInvitationStatus } from './helpers';
import type { CampaignLeadInvitation } from './types';

interface LeadInvitationsPanelProps {
  invitations: CampaignLeadInvitation[];
  loading: boolean;
  respondingCampaignId: string | null;
  onRefresh: () => void;
  onAccept: (campaignId: string) => void;
}

export function LeadInvitationsPanel({ invitations, loading, respondingCampaignId, onRefresh, onAccept }: LeadInvitationsPanelProps) {
  return (
    <div className="rounded-md border bg-slate-50 p-4 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold text-slate-900">CSR Campaign Lead NGO Invitations</p>
          <p className="text-sm text-slate-600">Companies invite your NGO to lead a CSR campaign before it is published.</p>
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
          <p className="font-medium">No invitations pending</p>
          <p className="mt-1 text-sm">CSR campaign lead invites from companies will appear here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {invitations.map((invite) => {
            const actionable = isActionableLeadInvitationStatus(invite.status);
            return (
              <div key={invite.id} className="rounded-md border bg-white p-3 space-y-2">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="font-semibold">{invite.campaign_title}</p>
                    <p className="flex flex-wrap items-center gap-1 text-sm text-slate-600">
                      <span>Invited by:</span>
                      <VerifiedAccountName
                        name={invite.company_name}
                        status={invite.company_verification_status}
                        verified={invite.company_verified}
                        size="xs"
                        nameClassName="font-medium text-slate-800"
                      />
                    </p>
                    <p className="text-xs text-slate-500">{invite.company_email || 'No email'} • {invite.campaign_location || 'Location not set'}</p>
                  </div>
                  <Badge variant="outline" className={`w-fit ${getStatusBadgeClass(invite.status)}`}>
                    {formatStatusLabel(invite.status)}
                  </Badge>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => onAccept(invite.campaign_id)}
                    disabled={!actionable || respondingCampaignId === invite.campaign_id}
                  >
                    {respondingCampaignId === invite.campaign_id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Accept'}
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
