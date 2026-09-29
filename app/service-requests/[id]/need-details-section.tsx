import Link from 'next/link'
import { DetailField, DetailSection, displayValue, parseImages } from '@/components/detail-fields'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { parseJsonObject } from '@/lib/utils'
import { getNeedFlags, isLinkedToProject, normalizeRequestType, parseRequirements } from './helpers'
import { SquareImageGallery } from './square-image-gallery'
import type { RequestRecord } from './types'

export function RequestNeedDetailsSection({ request }: { request: RequestRecord }) {
  const requirements = parseRequirements(request.requirements)
  const projectContext: Record<string, unknown> = parseJsonObject(requirements.project_context)
  const categoryDetails = (requirements.category_details && typeof requirements.category_details === 'object'
    ? requirements.category_details
    : parseJsonObject(requirements.details)) as Record<string, unknown>

  const requestType = normalizeRequestType(
    String(requirements.request_type || request.request_type || request.category || '')
  )
  const linkedToProject = isLinkedToProject(requirements, request.project)
  const images = parseImages(request.images)
  const budget = request.estimated_budget ?? requirements.estimated_budget ?? requirements.budget
  const beneficiaryCount = request.beneficiary_count ?? Number(requirements.beneficiary_count || 0)
  const impactDescription = request.impact_description ?? requirements.impact_description
  const contactInfo = requirements.contactInfo ?? requirements.contact_info
  const timeline = request.timeline || request.deadline || requirements.timeline
  const linkedProjectId = String(request.project?.id || requirements.projectId || requirements.project_id || '').trim()
  const linkedProjectTitle = String(
    request.project?.title || projectContext.project_title || 'Linked project'
  )

  const { isMaterialNeed, isSkillServiceNeed, isInfrastructureNeed } = getNeedFlags(requestType)

  return (
    <div className="space-y-6">
      <section className="space-y-6">
        <h3 className="text-sm font-medium text-gray-500">Need Details</h3>

        <div>
          <p className="text-sm text-gray-500">Need Title</p>
          <p className="text-sm font-medium text-slate-800">{displayValue(request.title)}</p>
        </div>

        <section className="space-y-3">
          <h4 className="text-sm font-medium text-gray-500">Description</h4>
          <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{displayValue(request.description)}</p>
        </section>

        {images.length > 0 ? (
          <section className="space-y-3">
            <h4 className="text-sm font-medium text-gray-500">Images</h4>
            <SquareImageGallery images={images} alt={request.title} thumbClassName="h-20 w-20 sm:h-24 sm:w-24" />
          </section>
        ) : null}

        <div className="grid grid-cols-1 gap-x-12 gap-y-6 md:grid-cols-2">
          <DetailField label="Need Type" value={requestType} />
          {!linkedToProject ? (
            <DetailField
              label="Beneficiary Count"
              value={beneficiaryCount > 0 ? beneficiaryCount.toLocaleString('en-IN') : 'Not set'}
            />
          ) : (
            <DetailField label="Beneficiary Count" value="Inherited from project" />
          )}
          <DetailField label="Budget Range" value={displayValue(budget)} />
        </div>

        <section className="space-y-3">
          <h4 className="text-sm font-medium text-gray-500">Impact Description</h4>
          <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
            {displayValue(impactDescription)}
          </p>
        </section>

        <div className="grid grid-cols-1 gap-x-12 gap-y-6 md:grid-cols-2">
          {linkedToProject ? (
            <DetailField label="Timeline / Deadline" value="Inherited from project" />
          ) : (
            <DetailField label="Timeline / Deadline" value={displayValue(timeline)} />
          )}
          <div className="md:col-span-2">
            <DetailField label="Contact Information" value={displayValue(contactInfo)} />
          </div>
        </div>
      </section>

      {isMaterialNeed ? (
        <DetailSection title="Material Details">
          <div className="md:col-span-2">
            <DetailField label="Items Needed" value={displayValue(categoryDetails.material_items)} />
          </div>
        </DetailSection>
      ) : null}

      {isSkillServiceNeed ? (
        <DetailSection title="Skill / Service Details">
          <DetailField label="Role Needed" value={displayValue(categoryDetails.skill_role)} />
          <DetailField label="Duration" value={displayValue(categoryDetails.skill_duration)} />
        </DetailSection>
      ) : null}

      {isInfrastructureNeed ? (
        <DetailSection title="Infrastructure Scope">
          <div className="md:col-span-2">
            <DetailField label="Scope" value={displayValue(categoryDetails.infrastructure_scope)} />
          </div>
        </DetailSection>
      ) : null}

      {linkedToProject && linkedProjectId ? (
        <section className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
          <h3 className="text-sm font-medium text-gray-500">Project Context</h3>
          <DetailField label="Linked Project" value={linkedProjectTitle} />
          {projectContext.project_category ? (
            <div className="pt-1">
              <Badge variant="secondary" className="border-gray-200 bg-gray-100 text-gray-700">
                {String(projectContext.project_category)}
              </Badge>
            </div>
          ) : null}
          <Link href={`/service-requests/projects/${linkedProjectId}`}>
            <Button variant="outline" size="sm">View Project Detail</Button>
          </Link>
        </section>
      ) : null}
    </div>
  )
}
