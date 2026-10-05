import type { ComponentProps, ReactNode } from 'react'
import { Calendar, CheckCircle, Loader2, Mail, XCircle, type LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { VerifiedAccountName } from '@/components/verification-badge'
import { formatDeliveryTrackingStatus } from '@/lib/service-request-allocation'
import { parseJsonObject } from '@/lib/utils'
import { formatDate, formatVolunteerOffer } from './helpers'
import { StatusBadge } from './status-badges'
import type { ServiceRequest, Volunteer } from './types'

export type VolunteerCardProps = {
  request: ServiceRequest
  volunteer: Volunteer
  deliverableNeed: boolean
  busy: boolean
  onStatusChange: (volunteer: Volunteer, newStatus: string) => void
}

export function EmptyTabCard({ icon: Icon, message }: { icon: LucideIcon; message: string }) {
  return (
    <Card>
      <CardContent className="pt-6 text-center text-gray-500">
        <Icon className="mx-auto mb-2" size={48} />
        <p>{message}</p>
      </CardContent>
    </Card>
  )
}

function VolunteerIdentity({ volunteer, showStatus = true }: { volunteer: Volunteer; showStatus?: boolean }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <VerifiedAccountName
        name={volunteer.volunteer_name}
        status={volunteer.volunteer_verification_status}
        size="sm"
        nameClassName="font-semibold"
      />
      <Badge variant="outline">
        {volunteer.volunteer_type === 'individual' ? 'Individual' : 'Company'}
      </Badge>
      {showStatus ? <StatusBadge status={volunteer.status} /> : null}
    </div>
  )
}

function EmailItem({ email }: { email: string }) {
  return (
    <span className="flex items-center gap-1">
      <Mail size={14} />
      {email}
    </span>
  )
}

function DateItem({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-center gap-1">
      <Calendar size={14} />
      {children}
    </span>
  )
}

function HoursItem({ hours }: { hours: number }) {
  return (
    <span className="text-green-600 font-medium">
      {hours} hours contributed
    </span>
  )
}

function MessageBox({ message, className }: { message: string; className: string }) {
  return (
    <div className={className}>
      <p className="text-sm text-gray-700">
        <strong>Message:</strong> {message}
      </p>
    </div>
  )
}

function DeliveryStatus({ volunteer }: { volunteer: Volunteer }) {
  return (
    <p className="text-sm text-indigo-700">
      Delivery: {formatDeliveryTrackingStatus(
        parseJsonObject(volunteer.response_meta)
      )}
    </p>
  )
}

function ActionButton({ busy, children, ...props }: ComponentProps<typeof Button> & { busy: boolean }) {
  return (
    <Button size="sm" disabled={busy} {...props}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
    </Button>
  )
}

export function PendingVolunteerCard({ request, volunteer, busy, onStatusChange }: VolunteerCardProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <VolunteerIdentity volunteer={volunteer} showStatus={false} />
            <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
              <EmailItem email={volunteer.volunteer_email} />
              <DateItem>Applied {formatDate(volunteer.applied_at)}</DateItem>
              <span className="font-medium text-slate-700">
                Offer: {formatVolunteerOffer(request, volunteer)}
              </span>
            </div>
            {volunteer.message && (
              <MessageBox message={volunteer.message} className="bg-gray-50 p-3 rounded-lg mb-3" />
            )}
          </div>
          <div className="flex gap-2 ml-4">
            <ActionButton
              busy={busy}
              onClick={() => onStatusChange(volunteer, 'accepted')}
              className="bg-green-600 hover:bg-green-700"
            >
              <CheckCircle size={16} className="mr-1" />
              Accept
            </ActionButton>
            <ActionButton
              busy={busy}
              variant="outline"
              onClick={() => onStatusChange(volunteer, 'rejected')}
              className="border-red-200 text-red-600 hover:bg-red-50"
            >
              <XCircle size={16} className="mr-1" />
              Reject
            </ActionButton>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function AcceptedVolunteerCard({ request, volunteer, deliverableNeed, busy, onStatusChange }: VolunteerCardProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <VolunteerIdentity volunteer={volunteer} />
            <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
              <EmailItem email={volunteer.volunteer_email} />
              <DateItem>Accepted {formatDate(volunteer.applied_at)}</DateItem>
              <span className="font-medium text-slate-700">
                Assigned: {formatVolunteerOffer(request, volunteer)}
              </span>
            </div>
            {deliverableNeed ? <DeliveryStatus volunteer={volunteer} /> : null}
            {volunteer.message && (
              <MessageBox message={volunteer.message} className="bg-gray-50 p-3 rounded-lg" />
            )}
          </div>
          {/* Deliverable needs advance through delivery tracking instead of manual status changes. */}
          {!deliverableNeed ? (
            <div className="flex gap-2 ml-4">
              <ActionButton busy={busy} onClick={() => onStatusChange(volunteer, 'active')}>
                Start Work
              </ActionButton>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

export function ActiveVolunteerCard({ request, volunteer, deliverableNeed, busy, onStatusChange }: VolunteerCardProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <VolunteerIdentity volunteer={volunteer} />
            <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
              <EmailItem email={volunteer.volunteer_email} />
              {volunteer.start_date && (
                <DateItem>Started {formatDate(volunteer.start_date)}</DateItem>
              )}
              {volunteer.hours_contributed > 0 && <HoursItem hours={volunteer.hours_contributed} />}
              <span className="font-medium text-slate-700">
                Assigned: {formatVolunteerOffer(request, volunteer)}
              </span>
            </div>
            {deliverableNeed ? <DeliveryStatus volunteer={volunteer} /> : null}
          </div>
          {!deliverableNeed ? (
            <div className="flex gap-2 ml-4">
              <ActionButton
                busy={busy}
                onClick={() => onStatusChange(volunteer, 'completed')}
                className="bg-green-600 hover:bg-green-700"
              >
                Mark Complete
              </ActionButton>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

export function CompletedVolunteerCard({ volunteer }: Pick<VolunteerCardProps, 'volunteer'>) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <VolunteerIdentity volunteer={volunteer} />
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <EmailItem email={volunteer.volunteer_email} />
              {volunteer.end_date && (
                <DateItem>Completed {formatDate(volunteer.end_date)}</DateItem>
              )}
              {volunteer.hours_contributed > 0 && <HoursItem hours={volunteer.hours_contributed} />}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
