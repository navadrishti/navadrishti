import { Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getNeedRemainingQuantity, getServiceRequestTarget } from '@/lib/service-request-allocation'
import { formatDate } from './helpers'
import { StatusBadge, UrgencyBadge } from './status-badges'
import type { ServiceRequest } from './types'

type NeedDetailsCardProps = {
  request: ServiceRequest
  applicantCount: number
  deliverableNeed: boolean
}

export function NeedDetailsCard({ request, applicantCount, deliverableNeed }: NeedDetailsCardProps) {
  const needTarget = getServiceRequestTarget(request)
  const needRemaining = getNeedRemainingQuantity(request)

  const needTargetLabel = needTarget.isFinancial
    ? (needTarget.amount > 0 ? `INR ${needTarget.amount.toLocaleString('en-IN')}` : 'Open budget')
    : (needTarget.quantity > 0 ? `${needTarget.quantity} units` : String(request.beneficiary_count || 0))

  const needRemainingLabel = needTarget.isFinancial
    ? (needTarget.amount > 0 ? `INR ${needRemaining.toLocaleString('en-IN')}` : 'Open')
    : (needTarget.quantity > 0 ? `${needRemaining} units` : String(needRemaining))

  return (
    <Card className="mb-8">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-2xl mb-2">{request.title}</CardTitle>
            <div className="flex gap-2 mb-4">
              <Badge variant="secondary">{request.category}</Badge>
              <UrgencyBadge urgency={request.urgency_level} />
              <StatusBadge status={request.status} />
            </div>
          </div>
          <div className="text-right text-sm text-gray-500">
            <p>Created: {formatDate(request.created_at)}</p>
            <p className="flex items-center gap-1 mt-1">
              <Users size={16} />
              {applicantCount} applicant{applicantCount !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-gray-700 mb-4">{request.description}</p>
        <div className="grid grid-cols-1 gap-2 text-sm text-gray-600 sm:grid-cols-3">
          {request.location ? <p>Location: {request.location}</p> : null}
          <p>Target: {needTargetLabel}</p>
          <p>Remaining: {needRemainingLabel}</p>
        </div>
        {deliverableNeed ? (
          <p className="mt-3 text-sm text-indigo-700">
            Deliverable need — fulfillment is tracked via Delhivery after you accept an applicant.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
