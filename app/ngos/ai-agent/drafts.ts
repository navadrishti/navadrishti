import {
  type NeedIntakeData,
  type ProjectIntakeData,
  type ServiceRequestDraftPayload,
  deriveAutoUrgency,
  normalizeProjectCategory,
  normalizeRequestType,
  parseProjectCategory,
  parseRequestType,
} from "./intake"

type DraftNeed = ServiceRequestDraftPayload['needs'][number]

export const buildNeedDraft = (need: NeedIntakeData, fallbackContact?: string): ServiceRequestDraftPayload => {
  const requestType = parseRequestType(need.requestType || '') || normalizeRequestType(need.requestType)
  const urgency = deriveAutoUrgency(need.timeline || '')
  const scheduleCategory = parseProjectCategory(need.category || '') || normalizeProjectCategory(need.category)

  const normalizedNeed = {
    title: need.title || 'Service Support Requirement',
    description: need.description || `Support needed to deliver outcomes for ${need.beneficiaryCount || '100'} beneficiaries.`,
    request_type: requestType,
    category: scheduleCategory,
    location: need.location || 'Location to be confirmed',
    urgency,
    timeline: need.timeline || '2 weeks',
    budget: 'Negotiable',
    estimated_budget: need.estimatedBudget || 'INR 50,000',
    beneficiary_count: need.beneficiaryCount || '100',
    impact_description: need.impactDescription || 'Measurable improvements for beneficiaries through targeted intervention.',
    contactInfo: need.contactInfo || fallbackContact || 'ngo@example.org',
    material_items: requestType === 'Material Need' ? (need.material_items || 'Specify item list and quantities') : '',
    skill_role: requestType === 'Skill / Service Need' ? (need.skill_role || 'Specify required role') : '',
    skill_duration: requestType === 'Skill / Service Need' ? (need.skill_duration || 'Specify required duration') : '',
    infrastructure_scope: requestType === 'Infrastructure Project' ? (need.infrastructure_scope || 'Specify infrastructure work scope') : ''
  }

  return {
    source: 'ngo-ai-agent',
    projectMode: 'new',
    project: {
      title: normalizedNeed.title,
      description: normalizedNeed.description,
      location: normalizedNeed.location,
      timeline: normalizedNeed.timeline,
      category: scheduleCategory
    },
    needs: [normalizedNeed]
  }
}

export const buildProjectDraft = (project: ProjectIntakeData): ServiceRequestDraftPayload => ({
  source: 'ngo-ai-agent',
  projectMode: 'new',
  project: {
    title: project.projectTitle || 'CSR Project Initiative',
    description: project.projectDescription || 'Project focused on improving community outcomes through structured support.',
    location: project.location || 'Location to be confirmed',
    timeline: project.timeline || '3 months',
    category: parseProjectCategory(project.projectCategory || '') || normalizeProjectCategory(project.projectCategory)
  },
  needs: []
})

export const describeNeedDraft = (draft: ServiceRequestDraftPayload) =>
  `Excellent! I've created your standalone Need:\n\n**Title:** ${draft.needs[0].title}\n**Type:** ${draft.needs[0].request_type}\n**Category:** ${draft.needs[0].category}\n\nNow review related service offers, invite the ones you want, and publish when ready.`

export const describeProjectDraft = (draft: ServiceRequestDraftPayload) =>
  `Excellent! I've created your CSR Project package:\n\n**Project:** ${draft.project.title}\n**Category:** ${draft.project.category}\n\nYou can now publish this project. Individual needs can be added later.`

export const buildNeedPublishBody = (need: DraftNeed, projectLocation: string) => {
  const normalizedTimeline = String(need.timeline || '').trim().toLowerCase() === 'anytime' ? 'Anytime (No expiry)' : need.timeline

  return {
    action: 'create',
    title: need.title,
    description: need.description,
    request_type: need.request_type,
    category: need.category,
    location: need.location || projectLocation || 'India',
    timeline: normalizedTimeline,
    budget: need.budget,
    estimated_budget: need.estimated_budget,
    beneficiary_count: need.beneficiary_count,
    impact_description: need.impact_description,
    contactInfo: need.contactInfo,
    details: {
      material_items: need.material_items,
      skill_role: need.skill_role,
      skill_duration: need.skill_duration,
      infrastructure_scope: need.infrastructure_scope
    }
  }
}

const deriveProjectValidUntil = (validUntil: string | undefined, timeline: string) => {
  let derivedValidUntil = String(validUntil || '').trim()
  if (!derivedValidUntil || Number.isNaN(new Date(derivedValidUntil).getTime())) {
    try {
      const direct = new Date(String(timeline || ''))
      if (!Number.isNaN(direct.getTime())) {
        derivedValidUntil = direct.toISOString().slice(0, 10)
      }
    } catch {}
  }
  if (!derivedValidUntil || Number.isNaN(new Date(derivedValidUntil).getTime())) {
    const future = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    derivedValidUntil = future.toISOString().slice(0, 10)
  }
  return derivedValidUntil
}

export const buildProjectPublishBody = (
  draft: ServiceRequestDraftPayload,
  projectData: ProjectIntakeData,
  fallbackContact?: string
) => {
  const volunteersNeeded = Math.max(1, Number(String(projectData.volunteersNeeded || '').replace(/[^\d]/g, '')) || 1)
  const budgetInr = Number(String(projectData.budget || '').replace(/[^\d.]/g, '')) || null

  return {
    title: draft.project.title,
    description: draft.project.description,
    category: draft.project.category,
    address: {
      address_line: projectData.location || draft.project.location,
      city: projectData.city || projectData.location || 'Unknown',
      state: projectData.state || 'Maharashtra',
      pincode: projectData.pincode || '400001',
      country: 'India',
    },
    timeline: draft.project.timeline,
    expected_beneficiaries: Number(projectData.expectedBeneficiaries) || 100,
    valid_until: deriveProjectValidUntil(projectData.validUntil, draft.project.timeline),
    budget_inr: budgetInr,
    impact_description: projectData.impact || draft.project.description,
    contact_info: projectData.contactInfo || fallbackContact || null,
    volunteers_needed: volunteersNeeded,
    csr_project_available_for_csr: true,
  }
}
