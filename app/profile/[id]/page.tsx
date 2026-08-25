"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { Header } from "@/components/header"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Mail,
  Phone,
} from "lucide-react"
import { PHONE_VERIFICATION_ENABLED, formatGeographicCoverageArea, isCaVerifiedAccount, visibleCaBadgeNumber } from "@/lib/auth"
import { formatDisplayDate } from "@/lib/format-date"
import { formatProjectExactAddress } from "@/lib/project-address"
import { useAuth } from "@/lib/auth-context"
import {
  ComplianceBadge,
  type ComplianceBadgeKind,
  NgoComplianceBadges,
  VerificationBadge,
} from "@/components/verification-badge"
import { ProfileCoverMedia } from "@/components/profile-card"
import { DocumentFileViewer } from "@/components/ca-verification-review"
import { NgoPayDialog } from "@/components/profile-dashboard-tab"

const COMPLIANCE_DOC_ORDER = ["twelve_a", "eighty_g", "csr1", "fcra"] as const
const COMPLIANCE_DOC_LABELS: Record<(typeof COMPLIANCE_DOC_ORDER)[number], string> = {
  twelve_a: "12A",
  eighty_g: "80G",
  csr1: "CSR-1",
  fcra: "FCRA",
}

function isComplianceDocKey(key: string): key is (typeof COMPLIANCE_DOC_ORDER)[number] {
  return (COMPLIANCE_DOC_ORDER as readonly string[]).includes(key)
}

type NgoPublicProfile = {
  sectors_schedule_vii?: string[]
  registration_type?: string | null
  registration_number?: string | null
  fcra_number?: string | null
  fcra_expiry_date?: string | null
  document_expiries?: Array<{
    key: string
    label: string
    number?: string | null
    valid_until: string
    status: "ok" | "due_soon" | "expired"
  }>
  founded?: string | number | null
  volunteer_capacity?: string | number | null
  office_address?: string | null
  geographic_coverage_preview?: string | null
  past_projects?: Array<{
    title: string
    description?: string
    source?: "registration" | "platform"
    category?: string
    location?: string
    timeline?: string
    expected_beneficiaries?: number | null
    valid_until?: string | null
    status?: string
  }>
  work_areas?: Array<{ region: string; state: string; district: string; area_type: string }>
  execution_capacity?: {
    concurrent_projects: string
    annual_beneficiaries: string
    delivery_model: string
    notes: string
  } | null
  compliance_documents?: Array<{
    key: string
    label: string
    url: string
    registration_number?: string | null
  }>
  ca_compliance_tags?: string[]
  accepts_payments?: boolean
  csr_eligible?: boolean
}

interface UserProfile {
  id: number
  name: string
  email: string
  phone?: string | null
  email_verified?: boolean
  phone_verified?: boolean
  user_type: string
  location: string
  profile_image: string
  cover_image?: string | null
  city: string
  state_province?: string | null
  pincode?: string | null
  country?: string | null
  created_at: string
  verification_status?: string
  website?: string | null
  bio?: string | null
  profile_data?: {
    bio?: string
    ca_badge_number?: string | null
  }
  ngo_public?: NgoPublicProfile
  verification_details?: Record<string, unknown> | null
  ca_badge_number?: string | null
  volunteering_history?: Array<{
    campaign_id: string
    campaign_title: string
    days_present: number
    project_days: number
    attendance_rate?: number
    capacity?: number
    completed_at?: string
    start_date?: string | null
    end_date?: string | null
  }>
}

const DELIVERY_MODEL_LABELS: Record<string, string> = {
  direct: "Direct delivery",
  partner_led: "Partner-led",
  hybrid: "Hybrid (direct + partners)",
}

function ProfileSection({
  title,
  children,
  empty,
}: {
  title: string
  children: React.ReactNode
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

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  const text = value === null || value === undefined ? "" : String(value).trim()
  return (
    <div>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="font-medium text-slate-900">{text || "Not set"}</p>
    </div>
  )
}

function VerificationStatusRow({
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

function formatUserType(userType?: string) {
  const value = String(userType || "").trim().toLowerCase()
  if (value === "ngo") return "NGO"
  if (value === "individual") return "Individual"
  if (value === "company") return "Company"
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "Not set"
}

function formatVolunteerCapacity(value?: string | number | null) {
  if (value === null || value === undefined) return "Not set"
  const text = String(value).trim()
  if (!text) return "Not set"
  return /people/i.test(text) ? text : `${text} people`
}

export default function ImpactProfilePage() {
  const params = useParams<{ id: string }>()
  const id = String(params?.id || "")
  const fetchingRef = useRef(false)
  const { user } = useAuth()

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewingDoc, setViewingDoc] = useState<{ url: string; label: string } | null>(null)
  const [payDialogOpen, setPayDialogOpen] = useState(false)

  useEffect(() => {
    const fetchProfileData = async () => {
      if (fetchingRef.current) return

      try {
        fetchingRef.current = true
        setLoading(true)
        setError(null)

        const profileRes = await fetch(`/api/profile/${id}`)
        const profileData = await profileRes.json()

        if (!profileRes.ok || !profileData.success) {
          setError(profileData.error || "Profile not found")
          return
        }

        setProfile(profileData.profile)
      } catch (err: any) {
        console.error("Profile fetch error:", err)
        setError(err.message || "Failed to load profile")
      } finally {
        setLoading(false)
        fetchingRef.current = false
      }
    }

    if (id) {
      setViewingDoc(null)
      fetchProfileData()
    }
  }, [id])

  const getInitials = (name: string) => {
    if (!name) return "U"
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric" })
  }

  const allVerified = Boolean(
    profile?.email_verified &&
      (PHONE_VERIFICATION_ENABLED ? profile?.phone_verified : true) &&
      profile?.verification_status === "verified"
  )
  const caBadgeNumber =
    visibleCaBadgeNumber(profile?.verification_status, profile?.profile_data) ||
    (allVerified ? profile?.ca_badge_number || null : null)
  const bio = profile?.bio || profile?.profile_data?.bio || ""
  const isNgo = profile?.user_type === "ngo"
  const ngo = profile?.ngo_public
  const canPay = user?.user_type === "individual" || user?.user_type === "company"
  const isNgoViewer = user?.user_type === "ngo"
  const payerCaVerified = isCaVerifiedAccount(user?.verification_status)
  const canPayThisNgo =
    Boolean(isNgo) &&
    canPay &&
    payerCaVerified &&
    Boolean(ngo?.accepts_payments ?? allVerified) &&
    (user?.user_type !== "company" || Boolean(ngo?.csr_eligible || ngo?.ca_compliance_tags?.includes("csr1")))
  const scheduleViiSector = ngo?.sectors_schedule_vii?.[0]?.trim() || ""
  const volunteerCapacityText = formatVolunteerCapacity(ngo?.volunteer_capacity)
  const pastProjects = ngo?.past_projects || []
  const workAreas = ngo?.work_areas || []
  const executionCapacity = ngo?.execution_capacity
  const caTags = new Set(ngo?.ca_compliance_tags || [])
  const complianceCards = (() => {
    type Card = {
      key: string
      kind: ComplianceBadgeKind | null
      label: string
      number?: string | null
      valid_until?: string | null
      status?: "ok" | "due_soon" | "expired"
      url?: string | null
      verified: boolean
    }
    const byKey = new Map<string, Card>()

    for (const item of ngo?.document_expiries || []) {
      if (!isComplianceDocKey(item.key)) continue
      byKey.set(item.key, {
        key: item.key,
        kind: item.key,
        label: item.label || COMPLIANCE_DOC_LABELS[item.key],
        number: item.number,
        valid_until: item.valid_until,
        status: item.status,
        url: null,
        verified: caTags.has(item.key),
      })
    }

    for (const doc of ngo?.compliance_documents || []) {
      if (!isComplianceDocKey(doc.key)) continue
      const existing = byKey.get(doc.key)
      if (existing) {
        existing.url = doc.url
        existing.number = existing.number || doc.registration_number
        existing.label = existing.label || doc.label || COMPLIANCE_DOC_LABELS[doc.key]
        existing.verified = existing.verified || caTags.has(doc.key)
      } else {
        byKey.set(doc.key, {
          key: doc.key,
          kind: doc.key,
          label: doc.label || COMPLIANCE_DOC_LABELS[doc.key],
          number: doc.registration_number,
          url: doc.url,
          verified: caTags.has(doc.key),
        })
      }
    }

    return COMPLIANCE_DOC_ORDER.map((key) => byKey.get(key)).filter(
      (card): card is Card => Boolean(card)
    )
  })()

  if (loading) {
    return (
      <>
        <Header />
        <div className="container mx-auto px-4 py-8">
          <Card className="mb-8 overflow-hidden animate-pulse">
            <div className="h-36 bg-slate-100 sm:h-48" />
            <CardContent className="pt-6">
              <div className="flex flex-col gap-6 md:flex-row">
                <div className="-mt-16 h-32 w-32 rounded-full border-4 border-white bg-slate-100" />
                <div className="flex-1 space-y-4">
                  <div className="h-9 w-64 rounded bg-slate-100" />
                  <div className="h-4 w-48 rounded bg-slate-100" />
                  <div className="h-4 w-56 rounded bg-slate-100" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="animate-pulse">
            <CardContent className="space-y-4 py-6">
              <div className="h-5 w-40 rounded bg-slate-100" />
              <div className="h-4 w-full rounded bg-slate-100" />
              <div className="h-4 w-5/6 rounded bg-slate-100" />
            </CardContent>
          </Card>
        </div>
      </>
    )
  }

  if (error || !profile) {
    return (
      <>
        <Header />
        <div className="container mx-auto px-4 py-8">
          <Card>
            <CardContent className="py-12 pt-6 text-center">
              <p className="mb-4 text-red-600">{error || "Profile not found"}</p>
              <Button
                onClick={() => window.history.back()}
                className="hover:bg-transparent focus-visible:bg-transparent focus-visible:ring-0 active:bg-transparent"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
            </CardContent>
          </Card>
        </div>
      </>
    )
  }

  return (
    <>
      <Header />
      <div className="container mx-auto px-4 py-8">
        <Card className="mb-8 overflow-hidden">
          <ProfileCoverMedia src={profile.cover_image} className="h-36 w-full sm:h-48" alt="" />
          <CardContent className="pt-0">
            <div className="flex flex-col gap-6 md:flex-row">
              <Avatar className="z-10 -mt-12 h-28 w-28 border-4 border-white shadow-sm sm:h-32 sm:w-32">
                <AvatarImage src={profile.profile_image} />
                <AvatarFallback className="bg-udaan-orange text-3xl text-white">
                  {getInitials(profile.name)}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1 md:pt-4">
                <div className="mb-4 flex flex-col gap-3">
                  <div className="flex flex-col items-start gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                    <h1 className="min-w-0 break-words text-3xl font-bold text-gray-900">{profile.name}</h1>
                    {allVerified ? (
                      <VerificationBadge
                        status="verified"
                        size="xl"
                        showText={false}
                        badgeNumber={null}
                        className="max-w-full"
                      />
                    ) : null}
                  </div>
                  {isNgo ? (
                    <NgoComplianceBadges
                      tags={ngo?.ca_compliance_tags}
                      registrationType={ngo?.registration_type}
                      size="lg"
                      className="max-w-full"
                    />
                  ) : null}

                  {isNgo && !isNgoViewer ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {canPayThisNgo ? (
                        <Button
                          size="sm"
                          className="bg-emerald-700 text-white hover:bg-emerald-800"
                          onClick={() => setPayDialogOpen(true)}
                        >
                          Pay
                        </Button>
                      ) : canPay && !payerCaVerified ? (
                        <Button size="sm" variant="outline" disabled>
                          Verification required
                        </Button>
                      ) : canPay ? (
                        <Button size="sm" variant="outline" disabled>
                          Payout setup pending
                        </Button>
                      ) : (
                        <Button asChild size="sm" variant="outline">
                          <Link href="/login">
                            Sign in to pay
                          </Link>
                        </Button>
                      )}
                    </div>
                  ) : null}

                  {profile.email ? (
                    <p className="flex items-start gap-1.5 text-sm text-gray-600">
                      <Mail className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                      <a href={`mailto:${profile.email}`} className="break-all hover:text-emerald-700 hover:underline">
                        {profile.email}
                      </a>
                    </p>
                  ) : null}

                  {profile.phone ? (
                    <p className="flex items-start gap-1.5 text-sm text-gray-600">
                      <Phone className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                      <a
                        href={`tel:${profile.phone.replace(/\s+/g, "")}`}
                        className="break-all hover:text-emerald-700 hover:underline"
                      >
                        {profile.phone}
                      </a>
                    </p>
                  ) : null}

                  <div className="flex flex-col gap-2 text-sm text-gray-600 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
                    {(profile.city || profile.location) && !isNgo ? (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        {profile.city || profile.location}
                      </span>
                    ) : null}
                    <span className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Joined {formatDate(profile.created_at)}
                    </span>
                  </div>

                  <div className="mt-2">
                    <p className="mb-1 text-sm font-medium text-gray-500">About</p>
                    <p className="whitespace-pre-wrap text-gray-700">{bio || "Not set"}</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{isNgo ? "Organization Profile" : "Profile Information"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-8">
            {isNgo ? (
              <>
                <ProfileSection title="Organization Details">
                  <div className="grid gap-4 md:grid-cols-2">
                    <InfoRow label="User type" value={formatUserType(profile.user_type)} />
                    <InfoRow label="Schedule VII" value={scheduleViiSector || undefined} />
                    <InfoRow
                      label="Coverage"
                      value={
                        workAreas.length > 0
                          ? workAreas.map((area) => formatGeographicCoverageArea(area)).join("; ")
                          : ngo?.geographic_coverage_preview || undefined
                      }
                    />
                    <InfoRow label="Volunteer capacity" value={volunteerCapacityText === "Not set" ? undefined : volunteerCapacityText} />
                    <InfoRow label="Registration type" value={ngo?.registration_type || undefined} />
                    <InfoRow label="Registration number" value={ngo?.registration_number || undefined} />
                    <InfoRow label="Registered office address" value={ngo?.office_address || undefined} />
                    <InfoRow label="FCRA number" value={ngo?.fcra_number || undefined} />
                    <InfoRow
                      label="FCRA expiry"
                      value={
                        ngo?.fcra_expiry_date
                          ? formatDisplayDate(ngo.fcra_expiry_date)
                          : ngo?.document_expiries?.find((item) => item.key === "fcra")
                            ? formatDisplayDate(
                                ngo.document_expiries.find((item) => item.key === "fcra")!.valid_until
                              )
                            : undefined
                      }
                    />
                    <InfoRow
                      label="Founded"
                      value={ngo?.founded ? String(ngo.founded) : undefined}
                    />
                    <VerificationStatusRow
                      allVerified={allVerified}
                      emailVerified={Boolean(profile.email_verified)}
                      phoneVerified={Boolean(profile.phone_verified)}
                      badgeNumber={caBadgeNumber}
                    />
                  </div>
                </ProfileSection>

                {complianceCards.length > 0 ? (
                  <ProfileSection title="Compliance Documents">
                    {viewingDoc ? (
                      <DocumentFileViewer
                        url={viewingDoc.url}
                        label={viewingDoc.label}
                        onBack={() => setViewingDoc(null)}
                      />
                    ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      {complianceCards.map((item) => (
                        <div key={item.key} className="rounded-lg border bg-white p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-medium text-slate-900">{item.label}</p>
                              {item.number ? (
                                <p className="mt-1 text-sm text-slate-600">Ref: {item.number}</p>
                              ) : null}
                              {item.valid_until ? (
                                <p className="mt-2 text-sm text-slate-700">
                                  Valid until {formatDisplayDate(item.valid_until)}
                                </p>
                              ) : null}
                              {item.status === "expired" ? (
                                <p className="mt-1 text-xs font-medium text-red-600">Expired</p>
                              ) : item.status === "due_soon" ? (
                                <p className="mt-1 text-xs font-medium text-amber-700">Expiring soon</p>
                              ) : null}
                              {item.url ? (
                                <button
                                  type="button"
                                  onClick={() => setViewingDoc({ url: item.url!, label: item.label })}
                                  className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-orange-600 hover:text-orange-700"
                                >
                                  View
                                </button>
                              ) : null}
                            </div>
                            {item.verified && item.kind ? (
                              <ComplianceBadge
                                kind={item.kind}
                                size="xl"
                                showText={false}
                                className="opacity-60"
                              />
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                    )}
                  </ProfileSection>
                ) : null}

                <ProfileSection title="Past Projects">
                  {pastProjects.length > 0 ? (
                    <div className="space-y-3">
                      {pastProjects.map((project, index) => {
                        const location = formatProjectExactAddress(project.location)
                        return (
                          <div key={`${project.title}-${index}`} className="space-y-3 rounded-lg border bg-white p-4">
                            <div>
                              <p className="font-medium text-slate-900">{project.title}</p>
                              {project.source ? (
                                <p className="mt-1 text-xs text-slate-500">
                                  {project.source === "platform" ? "Created on GRAM" : "Added during registration"}
                                </p>
                              ) : null}
                            </div>
                            {project.description ? (
                              <p className="whitespace-pre-wrap break-words text-sm text-slate-600">{project.description}</p>
                            ) : null}
                            <div className="grid gap-3 md:grid-cols-2">
                              <InfoRow label="Category" value={project.category} />
                              <InfoRow label="Status" value={project.status} />
                              <InfoRow label="Location" value={location !== "Not set" ? location : undefined} />
                              <InfoRow label="Timeline" value={project.timeline} />
                              <InfoRow
                                label="Expected beneficiaries"
                                value={
                                  project.expected_beneficiaries
                                    ? Number(project.expected_beneficiaries).toLocaleString("en-IN")
                                    : undefined
                                }
                              />
                              <InfoRow
                                label="Valid until"
                                value={project.valid_until ? formatDisplayDate(project.valid_until) : undefined}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-600">0</p>
                  )}
                </ProfileSection>

                <ProfileSection title="Work Areas">
                  {workAreas.length > 0 ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      {workAreas.map((area, index) => (
                        <InfoRow
                          key={`${area.state}-${area.district}-${index}`}
                          label={area.area_type || "Work area"}
                          value={formatGeographicCoverageArea(area)}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="font-medium text-slate-900">Not set</p>
                  )}
                </ProfileSection>

                <ProfileSection title="Execution Capacity" empty={!executionCapacity}>
                  <div className="grid gap-4 rounded-lg border bg-white p-4 md:grid-cols-2">
                    <InfoRow label="Concurrent projects" value={executionCapacity?.concurrent_projects} />
                    <InfoRow label="Annual beneficiaries" value={executionCapacity?.annual_beneficiaries} />
                    <InfoRow
                      label="Delivery model"
                      value={
                        executionCapacity?.delivery_model
                          ? DELIVERY_MODEL_LABELS[executionCapacity.delivery_model] ||
                            executionCapacity.delivery_model
                          : undefined
                      }
                    />
                    <div className="md:col-span-2">
                      <InfoRow label="Notes" value={executionCapacity?.notes} />
                    </div>
                  </div>
                </ProfileSection>

                <ProfileSection
                  title="Volunteering History"
                  empty={!Array.isArray(profile.volunteering_history) || profile.volunteering_history.length === 0}
                >
                  <div className="space-y-3">
                    {(profile.volunteering_history || []).map((entry) => (
                      <div
                        key={entry.campaign_id}
                        className="rounded-lg border border-slate-200 bg-slate-50 p-4"
                      >
                        <p className="font-medium text-slate-900">{entry.campaign_title}</p>
                        <p className="mt-1 text-sm text-slate-600">
                          Attended {entry.days_present} of {entry.project_days} project days
                          {entry.attendance_rate != null ? ` (${entry.attendance_rate}%)` : ''}
                          {entry.capacity && entry.capacity > 1
                            ? ` · Team capacity ×${entry.capacity}`
                            : ''}
                        </p>
                        {(entry.start_date || entry.end_date) && (
                          <p className="mt-1 text-xs text-slate-500">
                            {formatDisplayDate(entry.start_date) || '—'} →{' '}
                            {formatDisplayDate(entry.end_date) || '—'}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </ProfileSection>

              </>
            ) : (
              <div className="space-y-8">
                <div className="grid gap-4 md:grid-cols-2">
                  <InfoRow label="User type" value={formatUserType(profile.user_type)} />
                  <InfoRow label="Contact email" value={profile.email} />
                  <InfoRow label="Contact phone" value={profile.phone || undefined} />
                  <InfoRow label="Member since" value={formatDate(profile.created_at)} />
                  <InfoRow label="Location" value={profile.city || profile.location || undefined} />
                  <VerificationStatusRow
                    allVerified={allVerified}
                    emailVerified={Boolean(profile.email_verified)}
                    phoneVerified={Boolean(profile.phone_verified)}
                    badgeNumber={caBadgeNumber}
                  />
                  {profile.website ? <InfoRow label="Website" value={profile.website} /> : null}
                </div>

                <ProfileSection
                  title="Volunteering History"
                  empty={!Array.isArray(profile.volunteering_history) || profile.volunteering_history.length === 0}
                >
                  <div className="space-y-3">
                    {(profile.volunteering_history || []).map((entry) => (
                      <div
                        key={entry.campaign_id}
                        className="rounded-lg border border-slate-200 bg-slate-50 p-4"
                      >
                        <p className="font-medium text-slate-900">{entry.campaign_title}</p>
                        <p className="mt-1 text-sm text-slate-600">
                          Attended {entry.days_present} of {entry.project_days} project days
                          {entry.attendance_rate != null ? ` (${entry.attendance_rate}%)` : ''}
                        </p>
                        {(entry.start_date || entry.end_date) && (
                          <p className="mt-1 text-xs text-slate-500">
                            {formatDisplayDate(entry.start_date) || '—'} →{' '}
                            {formatDisplayDate(entry.end_date) || '—'}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </ProfileSection>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      {isNgo && !isNgoViewer ? (
        <NgoPayDialog
          ngo={profile ? { id: profile.id, name: profile.name, email: profile.email } : null}
          open={payDialogOpen}
          onOpenChange={setPayDialogOpen}
        />
      ) : null}
    </>
  )
}
