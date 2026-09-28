"use client"

import { formatGeographicCoverageArea } from "@/lib/auth"
import { formatDisplayDate, formatStatusLabel } from "@/lib/format-date"
import { formatProjectExactAddress } from "@/lib/service-request-allocation"
import { ComplianceDocumentsSection } from "./compliance-documents-section"
import { InfoRow, ProfileSection, VerificationStatusRow } from "./profile-fields"
import { VolunteeringHistorySection } from "./volunteering-history-section"
import { DELIVERY_MODEL_LABELS, buildComplianceCards, formatUserType, formatVolunteerCapacity } from "./helpers"
import type { UserProfile, ViewingDocument } from "./types"

interface NgoProfileSectionsProps {
  profile: UserProfile
  allVerified: boolean
  caBadgeNumber: string | null
  viewingDoc: ViewingDocument | null
  onViewDoc: (doc: ViewingDocument | null) => void
}

export function NgoProfileSections({
  profile,
  allVerified,
  caBadgeNumber,
  viewingDoc,
  onViewDoc,
}: NgoProfileSectionsProps) {
  const ngo = profile.ngo_public
  const scheduleViiSector = ngo?.sectors_schedule_vii?.[0]?.trim() || ""
  const volunteerCapacityText = formatVolunteerCapacity(ngo?.volunteer_capacity)
  const pastProjects = ngo?.past_projects || []
  const workAreas = ngo?.work_areas || []
  const executionCapacity = ngo?.execution_capacity
  const complianceCards = buildComplianceCards(ngo)
  const fcraExpiryRecord = ngo?.document_expiries?.find((item) => item.key === "fcra")

  return (
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
                : fcraExpiryRecord
                  ? formatDisplayDate(fcraExpiryRecord.valid_until)
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
        <ComplianceDocumentsSection cards={complianceCards} viewingDoc={viewingDoc} onViewDoc={onViewDoc} />
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
                    <InfoRow label="Status" value={formatStatusLabel(project.status)} />
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

      <VolunteeringHistorySection history={profile.volunteering_history} showTeamCapacity />
    </>
  )
}
