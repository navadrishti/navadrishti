'use client'

import { Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { VerifiedAccountName } from '@/components/verification-badge'
import { formatStatusLabel } from '@/lib/format-date'
import { getGramAvatarFallbackStyle } from '@/lib/gram-avatar'
import { formatDate, formatDateTime, getInitials, getStatusColor } from './helpers'
import type { ApplicantEntry } from './types'
import type { ApplicantReview } from './use-applicant-review'

interface ApplicantCardProps {
  applicant: ApplicantEntry
  isFinancialNeed: boolean
  isMaterialNeed: boolean
  review: ApplicantReview
}

export function ApplicantCard({ applicant, isFinancialNeed, isMaterialNeed, review }: ApplicantCardProps) {
  const {
    updatingApplicantId,
    decisionComments,
    setDecisionComments,
    applicantAllocations,
    setApplicantAllocations,
    applicantQuantities,
    setApplicantQuantities,
    setReceiptUploads,
    ngoCompletionNotes,
    setNgoCompletionNotes,
    handleApplicantDecision,
    handleNgoConfirm,
  } = review
  const isUpdating = updatingApplicantId === applicant.id

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full"
            style={
              applicant.volunteer?.profile_image
                ? undefined
                : getGramAvatarFallbackStyle(
                    applicant.volunteer?.name || applicant.volunteer?.ngo_name || 'A'
                  )
            }
          >
            {applicant.volunteer?.profile_image ? (
              // eslint-disable-next-line @next/next/no-img-element -- profile photos are user-uploaded URLs from arbitrary hosts
              <img src={applicant.volunteer.profile_image} alt={applicant.volunteer?.name} className="h-full w-full object-cover" />
            ) : (
              <span className="text-sm font-semibold">{getInitials(applicant.volunteer?.name || applicant.volunteer?.ngo_name || 'A')}</span>
            )}
          </div>
          <div className="min-w-0">
            <VerifiedAccountName
              name={applicant.volunteer?.name || 'Applicant'}
              status={applicant.volunteer?.verification_status}
              size="xs"
              nameClassName="font-semibold"
              className="min-w-0"
            />
            <p className="text-sm text-muted-foreground truncate">{applicant.volunteer?.email || 'Email not available'}</p>
            <p className="mt-1 text-xs text-muted-foreground truncate">
              {applicant.volunteer?.city ? `${applicant.volunteer.city}${applicant.volunteer.state_province ? ', ' + applicant.volunteer.state_province : ''}` : applicant.volunteer?.location || ''}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge className={getStatusColor(applicant.status)}>
            {formatStatusLabel(applicant.status || 'pending')}
          </Badge>
          <div className="text-sm text-muted-foreground">
            Applied on {formatDate(applicant.applied_at)}
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-sm font-medium">Application Message</p>
        <p className="text-sm whitespace-pre-wrap rounded bg-muted p-3">{applicant.application_message || 'No message provided.'}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm mt-2">
        <div>
          <p className="text-xs text-gray-500">Offered Fulfillment</p>
          <p className="font-medium">
            {isFinancialNeed
              ? `INR ${Number(applicant.fulfillment_amount || applicant.assigned_amount || 0).toLocaleString('en-IN')}`
              : String(applicant.fulfillment_quantity || applicant.assigned_quantity || 0)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Phone</p>
          <p className="font-medium">{applicant.volunteer?.phone || 'Not provided'}</p>
        </div>
      </div>

      {applicant.status === 'rejected' && applicant.response_meta?.ngo_decision_comment && (
        <div className="space-y-1">
          <p className="text-sm font-medium text-red-700">Rejection Comment</p>
          <p className="text-sm whitespace-pre-wrap rounded border border-red-200 bg-red-50 p-3 text-red-800">
            {applicant.response_meta.ngo_decision_comment}
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor={`comment-${applicant.id}`}>Decision Comment (optional)</Label>
        <Textarea
          id={`comment-${applicant.id}`}
          placeholder="Optional note for applicant (especially useful when rejecting)"
          value={decisionComments[applicant.id] || ''}
          onChange={(e) =>
            setDecisionComments((prev) => ({
              ...prev,
              [applicant.id]: e.target.value
            }))
          }
          rows={2}
        />
      </div>

      {applicant.status === 'pending' && (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor={`allocation-${applicant.id}`}>
              {isFinancialNeed ? 'Acceptable Amount' : 'Acceptable Quantity'}
            </Label>
            <Input
              id={`allocation-${applicant.id}`}
              type="number"
              min="1"
              value={isFinancialNeed ? (applicantAllocations[applicant.id] || '') : (applicantQuantities[applicant.id] || '')}
              onChange={(e) => {
                if (isFinancialNeed) {
                  setApplicantAllocations((prev) => ({ ...prev, [applicant.id]: e.target.value }))
                } else {
                  setApplicantQuantities((prev) => ({ ...prev, [applicant.id]: e.target.value }))
                }
              }}
              placeholder={isFinancialNeed ? 'e.g., 5000' : 'e.g., 10'}
            />
          </div>
          <div className="text-xs text-muted-foreground self-end">
            Fill this with the exact amount or quantity this applicant can handle.
          </div>
        </div>
      )}

      {(applicant.response_meta?.individual_done_at || applicant.response_meta?.ngo_confirmed_at) && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
          <div className="text-sm font-medium">Completion Tracking</div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor={`ngo-receipt-${applicant.id}`}>Receipt Upload</Label>
              <Input
                id={`ngo-receipt-${applicant.id}`}
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => setReceiptUploads((prev) => ({ ...prev, [applicant.id]: e.target.files?.[0] || null }))}
              />
            </div>
            <div>
              <Label htmlFor={`ngo-note-${applicant.id}`}>Confirmation Note</Label>
              <Textarea
                id={`ngo-note-${applicant.id}`}
                value={ngoCompletionNotes[applicant.id] || ''}
                onChange={(e) => setNgoCompletionNotes((prev) => ({ ...prev, [applicant.id]: e.target.value }))}
                rows={2}
              />
            </div>
          </div>
          {isMaterialNeed && applicant.response_meta?.delivery_tracking_id ? (
            <div className="space-y-2 rounded border bg-white p-2 text-xs text-muted-foreground">
              <div>
                Tracking ID:{' '}
                <span className="font-medium text-foreground">
                  {applicant.response_meta.delivery_tracking_id}
                </span>
              </div>
              <div>
                Status:{' '}
                <span className="font-medium text-foreground">
                  {applicant.response_meta?.delivery_tracking_last_status || 'Not synced yet'}
                </span>
              </div>
              <div>
                Last location: {applicant.response_meta?.delivery_tracking_last_location || 'N/A'}
              </div>
              <div>
                Last event:{' '}
                {formatDateTime(
                  applicant.response_meta?.delivery_tracking_last_event_at ||
                    applicant.response_meta?.delivery_tracking_synced_at
                )}
              </div>
            </div>
          ) : isMaterialNeed ? (
            <p className="text-xs text-muted-foreground">
              Delhivery tracking will appear here after the individual verifies pickup.
            </p>
          ) : null}
        </div>
      )}

      {applicant.status === 'pending' ? (
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            onClick={() => handleApplicantDecision(applicant, 'accepted')}
            disabled={isUpdating}
          >
            {isUpdating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              'Accept'
            )}
          </Button>
          <Button
            variant="destructive"
            onClick={() => handleApplicantDecision(applicant, 'rejected')}
            disabled={isUpdating}
          >
            {isUpdating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              'Reject'
            )}
          </Button>
        </div>
      ) : applicant.response_meta?.individual_done_at && !applicant.response_meta?.ngo_confirmed_at ? (
        <div className="flex flex-col sm:flex-row gap-2">
          <Button onClick={() => handleNgoConfirm(applicant)} disabled={isUpdating}>
            Confirm Receipt
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          This application has already been reviewed.
        </p>
      )}
    </div>
  )
}
