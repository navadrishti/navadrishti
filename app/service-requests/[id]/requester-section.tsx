import { VerifiedAccountName } from '@/components/verification-badge'
import { getGramAvatarFallbackStyle } from '@/lib/gram-avatar'
import { getInitials } from './helpers'
import type { ServiceRequest } from './types'

function RequesterField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-800">{value}</p>
    </div>
  )
}

export function RequesterSection({ request }: { request: ServiceRequest }) {
  const requesterProfile = request.requester
  const requesterProfileData = requesterProfile?.profile_data || {}
  const requesterLocation = requesterProfile?.city && requesterProfile?.state_province
    ? `${requesterProfile.city}, ${requesterProfile.state_province}${requesterProfile.country ? `, ${requesterProfile.country}` : ''}`
    : requesterProfile?.location || request.location || 'Location not set'
  const requesterPhone = requesterProfile?.phone || 'Phone not set'
  const profileCapacity = requesterProfileData.ngo_volunteer_capacity
  const requesterNgoSize = String(
    (typeof requesterProfile?.ngo_volunteer_capacity === 'number' && requesterProfile.ngo_volunteer_capacity >= 0)
      ? `${requesterProfile.ngo_volunteer_capacity} people`
      : (typeof profileCapacity === 'number' && profileCapacity >= 0)
        ? `${profileCapacity} people`
        : 'NGO size not set'
  )
  const requesterSector = String(requesterProfileData.sector || requesterProfile?.industry || 'Sector not set')
  const requesterFounded = String(requesterProfileData.founded || requesterProfileData.founded_year || 'Founded year not set')
  const requesterPincode = requesterProfile?.pincode || 'Pincode not set'

  return (
    <>
      <div className="flex items-start gap-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
        <div className="h-16 w-16 shrink-0 rounded-md bg-gray-100 flex items-center justify-center overflow-hidden">
          {requesterProfile?.profile_image ? (
            <img src={requesterProfile.profile_image} alt={request.ngo_name} className="h-full w-full object-cover" />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center"
              style={getGramAvatarFallbackStyle(requesterProfile?.name || request.ngo_name)}
            >
              <span className="text-lg font-semibold">{getInitials(requesterProfile?.name || request.ngo_name)}</span>
            </div>
          )}
        </div>

        <div className="min-w-0">
          <VerifiedAccountName
            name={request.ngo_name}
            status={request.requester?.verification_status}
            size="sm"
            nameClassName="text-lg font-semibold leading-tight"
            className="min-w-0"
          />
          <p className="mt-1 text-sm text-gray-500 break-all">{requesterProfile?.email || 'Email not set'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <RequesterField label="Location" value={requesterLocation} />
        <RequesterField label="Phone" value={requesterPhone} />
        <RequesterField label="NGO Size" value={requesterNgoSize} />
        <RequesterField label="Sector" value={requesterSector} />
        <RequesterField label="Founded Year" value={requesterFounded} />
        <RequesterField label="Pincode" value={requesterPincode} />
      </div>
    </>
  )
}
