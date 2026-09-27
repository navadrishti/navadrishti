import type { ReactNode } from "react"
import { PHONE_VERIFICATION_ENABLED } from "@/lib/auth"
import { VerificationBadge } from "@/components/verification-badge"

export function ProfileSection({
  title,
  children,
  empty,
}: {
  title: string
  children: ReactNode
  empty?: boolean
}) {
  if (empty) return null

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  )
}

export function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  const text = value === null || value === undefined ? "" : String(value).trim()
  return (
    <div>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="font-medium text-slate-900">{text || "Not set"}</p>
    </div>
  )
}

export function VerificationStatusRow({
  allVerified,
  emailVerified,
  phoneVerified,
  badgeNumber,
}: {
  allVerified: boolean
  emailVerified: boolean
  phoneVerified: boolean
  badgeNumber?: string | null
}) {
  const partialLabels = [
    emailVerified ? "Email Verified" : null,
    PHONE_VERIFICATION_ENABLED && phoneVerified ? "Phone Verified" : null,
  ].filter(Boolean)

  return (
    <div className="min-w-0">
      <p className="text-sm text-gray-500">Verification status</p>
      {allVerified ? (
        <VerificationBadge
          status="verified"
          size="xl"
          showText={true}
          badgeNumber={badgeNumber}
          className="mt-1 max-w-full"
        />
      ) : (
        <p className="font-medium text-slate-900">
          {partialLabels.length > 0 ? partialLabels.join(", ") : "Unverified"}
        </p>
      )}
    </div>
  )
}
