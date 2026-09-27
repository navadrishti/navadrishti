import { DetailField, displayValue } from '@/components/detail-fields';
import { formatDetailDate } from '@/lib/format-date';
import { formatProjectExactAddress } from '@/lib/service-request-allocation';
import type { ProjectRecord } from './types';

export function ProjectDetailFields({ project }: { project: ProjectRecord }) {
  const exactAddress = formatProjectExactAddress(project.exact_address || project.location)

  return (
    <div className="space-y-6">
      <section className="space-y-6">
        <h3 className="text-sm font-medium text-gray-500">Project Details</h3>

        <div>
          <p className="text-sm text-gray-500">Project Title</p>
          <p className="text-sm font-medium text-slate-800">{project.title}</p>
        </div>

        <div className="grid grid-cols-1 gap-x-12 gap-y-6 md:grid-cols-2">
          <DetailField label="Project Category" value={displayValue(project.category)} />
          <DetailField label="Project Exact Address" value={exactAddress} />
        </div>

        <section className="space-y-3">
          <h4 className="text-sm font-medium text-gray-500">Project Description</h4>
          <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
            {displayValue(project.description)}
          </p>
        </section>

        {project.impact_description ? (
          <section className="space-y-3">
            <h4 className="text-sm font-medium text-gray-500">Expected Impact</h4>
            <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
              {project.impact_description}
            </p>
          </section>
        ) : null}

        <div className="grid grid-cols-1 gap-x-12 gap-y-6 md:grid-cols-2">
          <DetailField label="Project Timeline" value={displayValue(project.timeline)} />
          <DetailField
            label="Expected Beneficiaries"
            value={
              project.expected_beneficiaries != null && project.expected_beneficiaries > 0
                ? Number(project.expected_beneficiaries).toLocaleString('en-IN')
                : 'Not set'
            }
          />
          <DetailField label="Project Valid Until" value={formatDetailDate(project.valid_until)} />
          <DetailField
            label="Budget (INR)"
            value={
              project.budget_inr != null && Number(project.budget_inr) > 0
                ? `₹${Number(project.budget_inr).toLocaleString('en-IN')}`
                : 'Not set'
            }
          />
          <DetailField
            label="Volunteers Needed"
            value={
              project.volunteers_needed != null && Number(project.volunteers_needed) > 0
                ? String(project.volunteers_needed)
                : 'Not set'
            }
          />
          <DetailField label="Contact" value={displayValue(project.contact_info)} />
        </div>
      </section>
    </div>
  )
}
