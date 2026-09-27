import { getGramAvatarFallbackStyle } from '@/lib/gram-avatar'
import { VerifiedAccountName } from '@/components/verification-badge'
import { Badge } from '@/components/ui/badge'
import { formatDate, getInitials } from './helpers'
import type { ServiceOffer } from './types'

interface ProviderTabProps {
  offer: ServiceOffer
  isOfferExpired: boolean
}

export function ProviderTab({ offer, isOfferExpired }: ProviderTabProps) {
  const providerName = offer.provider_name || offer.ngo_name

  return (
    <>
      <div className="flex items-start gap-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
        <div className="h-16 w-16 shrink-0 rounded-md bg-gray-100 flex items-center justify-center overflow-hidden">
          {offer.provider_profile_image ? (
            <img
              src={offer.provider_profile_image}
              alt={providerName}
              className="h-full w-full object-cover"
            />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center"
              style={getGramAvatarFallbackStyle(providerName)}
            >
              <span className="text-lg font-semibold">{getInitials(providerName)}</span>
            </div>
          )}
        </div>

        <div className="min-w-0">
          <VerifiedAccountName
            name={providerName}
            verified={Boolean(offer.verified)}
            status={offer.verification_status || offer.ngo?.verification_status}
            size="md"
            nameClassName="text-lg font-semibold leading-tight"
          />
          <p className="mt-1 text-sm text-gray-500 capitalize">{offer.provider_type || 'ngo'}</p>
          {isOfferExpired ? (
            <Badge variant="destructive" className="mt-2 w-fit">Expired</Badge>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Coverage</p>
          <p className="mt-1 text-sm font-medium text-slate-800">{offer.location_scope || offer.location || 'Not specified'}</p>
        </div>
        <div className="rounded-lg border border-slate-200 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contact</p>
          <p className="mt-1 text-sm font-medium text-slate-800 break-words">{offer.contact_info || 'Not specified'}</p>
        </div>
        <div className="rounded-lg border border-slate-200 p-4 md:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Validity Ends</p>
          <p className="mt-1 text-sm font-medium text-slate-800">{offer.valid_until ? formatDate(offer.valid_until) : 'Open-ended'}</p>
        </div>
      </div>
    </>
  )
}
