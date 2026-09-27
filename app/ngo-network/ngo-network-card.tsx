"use client"

import Link from "next/link"
import Image from "next/image"
import { ArrowRight, Mail, MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ProfileCoverMedia } from "@/components/profile-card"
import { NgoComplianceBadges, VerificationBadge } from "@/components/verification-badge"
import { getGramAvatarFallbackStyle } from "@/lib/gram-avatar"
import { getInitials, ngoComplianceTags, pluralize } from "./helpers"
import type { NetworkNgo, NgoViewerContext } from "./types"

function NgoAvatar({ ngo, size, textClassName }: { ngo: NetworkNgo; size: number; textClassName: string }) {
  if (ngo.profile_image) {
    return (
      <Image
        src={ngo.profile_image}
        alt={ngo.name}
        width={size}
        height={size}
        className="h-full w-full object-cover"
      />
    )
  }

  return (
    <div
      className={`flex h-full w-full items-center justify-center ${textClassName} font-bold`}
      style={getGramAvatarFallbackStyle(ngo.name)}
    >
      {getInitials(ngo.name)}
    </div>
  )
}

function ProjectCount({ count, singular, plural }: { count: number; singular: string; plural: string }) {
  return (
    <span>
      <span className="font-medium text-slate-800">{count}</span>
      {' '}
      {pluralize(count, singular, plural)}
    </span>
  )
}

function NgoCardDetails({ ngo, isNgoViewer }: { ngo: NetworkNgo; isNgoViewer: boolean }) {
  const sectorLabels = ngo.sectors_schedule_vii?.length
    ? ngo.sectors_schedule_vii
    : ngo.sector
      ? [ngo.sector]
      : []

  return (
    <div className="min-w-0 flex-1 pt-9 lg:pt-0">
      <h2 className="flex min-w-0 flex-wrap items-center gap-1.5 text-base font-bold text-slate-900">
        <span className="min-w-0 break-words">{ngo.name}</span>
        {ngo.compliance.verified ? (
          <VerificationBadge
            status="verified"
            size="sm"
            showText={false}
            badgeNumber={null}
            className="max-w-full min-w-0"
          />
        ) : null}
      </h2>

      <p className="mt-1 flex items-start gap-1.5 text-xs text-slate-600">
        <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
        <span>{ngo.location || "Location not listed"}</span>
      </p>

      {sectorLabels.length > 0 ? (
        <p className="mt-0.5 text-[11px] font-medium text-slate-500">
          Sector: {sectorLabels.join("; ")}
        </p>
      ) : null}

      {!isNgoViewer && ngo.email ? (
        <p className="mt-1 flex items-start gap-1.5 text-xs text-slate-600">
          <Mail className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
          <a href={`mailto:${ngo.email}`} className="break-all hover:text-emerald-700 hover:underline">
            {ngo.email}
          </a>
        </p>
      ) : null}

      {ngo.geographic_coverage_preview ? (
        <p className="mt-0.5 text-[11px] text-slate-500">
          Coverage: {ngo.geographic_coverage_preview}
        </p>
      ) : null}

      {ngo.mission ? (
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-700">{ngo.mission}</p>
      ) : null}

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
        <ProjectCount count={ngo.projects_completed_count || 0} singular="project completed" plural="projects completed" />
        <ProjectCount count={ngo.projects_ongoing_count || 0} singular="ongoing project" plural="ongoing projects" />
        <ProjectCount count={ngo.projects_active_count || 0} singular="active project" plural="active projects" />
        {ngo.execution_capacity ? (
          <span>Capacity: {ngo.execution_capacity}</span>
        ) : null}
      </div>
    </div>
  )
}

function NgoPayAction({
  ngo,
  canPay,
  payerCaVerified,
  isNgoViewer,
  userId,
  userType,
  onPay,
}: { ngo: NetworkNgo } & NgoViewerContext) {
  const hasCsr1 = Boolean(ngo.csr_eligible || ngo.compliance.csr1 || ngoComplianceTags(ngo).includes('csr1'))
  const acceptsPayments = Boolean(ngo.accepts_payments)
  const canPayNgo =
    canPay &&
    payerCaVerified &&
    acceptsPayments &&
    (userType !== "company" || hasCsr1)
  const payDisabledReason = (() => {
    if (!canPay) return null
    if (!payerCaVerified) return 'Verification required'
    if (userType === 'company' && !hasCsr1) return 'CSR-1 required'
    if (!acceptsPayments) return 'Payout not connected'
    return null
  })()

  if (canPayNgo) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="h-8 w-full"
        onClick={() => onPay(ngo)}
      >
        Pay
      </Button>
    )
  }

  if (payDisabledReason) {
    return (
      <Button size="sm" variant="outline" className="h-8 w-full" disabled>
        {payDisabledReason}
      </Button>
    )
  }

  if (isNgoViewer) {
    return ngo.id !== userId && ngo.email ? (
      <Button asChild size="sm" variant="outline" className="h-8 w-full">
        <a href={`mailto:${ngo.email}`}>
          Contact
        </a>
      </Button>
    ) : null
  }

  return (
    <Button asChild size="sm" variant="outline" className="h-8 w-full">
      <Link href="/login">
        Sign in to pay
      </Link>
    </Button>
  )
}

export function NgoNetworkCard({ ngo, ...viewer }: { ngo: NetworkNgo } & NgoViewerContext) {
  return (
    <article className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="relative lg:hidden">
        <ProfileCoverMedia src={ngo.cover_image} className="h-20 w-full" alt="" />
        <div className="absolute -bottom-8 left-3 h-16 w-16 overflow-hidden rounded-md border-2 border-white bg-slate-50 shadow-sm">
          <NgoAvatar ngo={ngo} size={64} textClassName="text-sm" />
        </div>
      </div>

      <div className="p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="mx-auto hidden h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-50 lg:mx-0 lg:flex">
            <NgoAvatar ngo={ngo} size={80} textClassName="text-base" />
          </div>

          <NgoCardDetails ngo={ngo} isNgoViewer={viewer.isNgoViewer} />

          <div className="flex w-full shrink-0 flex-col gap-1.5 lg:w-44">
            <div className="flex min-h-6 min-w-0 max-w-full flex-wrap items-center gap-x-2 gap-y-1">
              <NgoComplianceBadges
                tags={ngoComplianceTags(ngo)}
                registrationType={ngo.registration_type}
                size="sm"
                className="max-w-full"
              />
            </div>

            <Button
              asChild
              size="sm"
              className="h-8 w-full bg-udaan-orange text-white hover:bg-[#e87118]"
            >
              <Link href={`/profile/${ngo.id}`}>
                View profile
                <ArrowRight className="ml-1.5 h-3 w-3" />
              </Link>
            </Button>

            <NgoPayAction ngo={ngo} {...viewer} />
          </div>
        </div>
      </div>
    </article>
  )
}
