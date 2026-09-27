import { Badge } from '@/components/ui/badge';
import { VerifiedAccountName } from '@/components/verification-badge';
import { getGramAvatarFallbackStyle } from '@/lib/gram-avatar';
import { formatStatusLabel } from '@/lib/format-date';
import { getInitials, statusBadgeClass, type NgoSummary } from './helpers';

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-800">{value}</p>
    </div>
  );
}

export function RequestingOrganizationSection({ ngo, projectStatus }: { ngo: NgoSummary; projectStatus: string }) {
  return (
    <>
      <div className="flex items-start gap-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
        <div className="h-16 w-16 shrink-0 rounded-md bg-gray-100 flex items-center justify-center overflow-hidden">
          {ngo.profileImage ? (
            <img src={ngo.profileImage} alt={ngo.name} className="h-full w-full object-cover" />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center"
              style={getGramAvatarFallbackStyle(ngo.name)}
            >
              <span className="text-lg font-semibold">{getInitials(ngo.name)}</span>
            </div>
          )}
        </div>

        <div className="min-w-0">
          <VerifiedAccountName
            name={ngo.name}
            status={ngo.verificationStatus}
            size="md"
            nameClassName="text-lg font-semibold leading-tight"
          />
          <p className="mt-1 text-sm text-gray-500 break-all">{ngo.email}</p>
          <div className="mt-2">
            <Badge className={statusBadgeClass(projectStatus)}>
              {formatStatusLabel(projectStatus)}
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <InfoTile label="Location" value={ngo.location} />
        <InfoTile label="Phone" value={ngo.phone} />
        <InfoTile label="NGO Size" value={ngo.size} />
        <InfoTile label="Sector" value={ngo.sector} />
        <InfoTile label="Founded Year" value={ngo.founded} />
        <InfoTile label="Pincode" value={ngo.pincode} />
      </div>
    </>
  );
}
