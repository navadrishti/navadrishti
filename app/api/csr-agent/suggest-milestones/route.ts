import { NextRequest, NextResponse } from 'next/server'
import { buildSuggestedMilestoneSets } from '@/app/companies/csr-agent/helpers'
import { parseMoneyValue, type ProjectIntakeData } from '@/app/companies/csr-agent/session'
import {
  enforceCsrGenerateAbuseLimit,
  resolveOwnedCompanyId,
} from '@/lib/csr-agent/generate-access'
import {
  suggestMilestoneSets,
  suggestMilestonesInputSchema,
  type SuggestedMilestoneSetDraft,
} from '@/lib/csr-agent/llm'
import { authErrorResponse, getAuthUserFromRequest } from '@/lib/server-auth'
import { zodIssuesToUserMessage } from '@/lib/user-facing-error'

type SuggestResponse =
  | {
      success: true
      data: SuggestedMilestoneSetDraft[]
      degraded?: boolean
      warning?: string
    }
  | { success: false; error: string }

function toIntake(data: {
  campaignName?: string
  category: string
  city: string
  state_province: string
  budget: number
  start_date: string
  end_date: string
  volunteerRequirement?: string
  requirementDetails?: string
}): ProjectIntakeData {
  return {
    campaignName: data.campaignName,
    category: data.category,
    city: data.city,
    state: data.state_province,
    budget: String(data.budget),
    startDate: data.start_date,
    endDate: data.end_date,
    volunteerRequirement: data.volunteerRequirement,
    requirementDetails: data.requirementDetails,
  }
}

function fromLocalSets(refresh: boolean, intake: ProjectIntakeData): SuggestedMilestoneSetDraft[] {
  return buildSuggestedMilestoneSets(intake, refresh).map((set) => ({
    title: set.title,
    milestones: set.milestones.map((milestone) => ({
      title: String(milestone.title || '').trim() || 'Milestone',
      description: String(milestone.description || '').trim() || 'Phase delivery',
      budget_allocated: parseMoneyValue(milestone.budgetTarget) || 0,
      start_date: milestone.startDate,
      end_date: milestone.endDate,
    })),
  }))
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(request)
    if (user.user_type !== 'company') {
      return NextResponse.json<SuggestResponse>(
        { success: false, error: 'Only companies can request milestone suggestions' },
        { status: 403 }
      )
    }

    const abuseLimited = await enforceCsrGenerateAbuseLimit(user.id)
    if (abuseLimited) return abuseLimited

    const body = await request.json()
    const ownership = resolveOwnedCompanyId(user, body?.company_id)
    if (!ownership.ok) {
      return NextResponse.json<SuggestResponse>(
        { success: false, error: ownership.error },
        { status: ownership.status }
      )
    }

    const validation = suggestMilestonesInputSchema.safeParse({
      ...body,
      company_id: ownership.companyId,
    })
    if (!validation.success) {
      return NextResponse.json<SuggestResponse>(
        { success: false, error: zodIssuesToUserMessage(validation.error.issues) },
        { status: 400 }
      )
    }

    const intake = toIntake(validation.data)
    const refresh = Boolean(validation.data.refresh)

    try {
      const sets = await suggestMilestoneSets(validation.data)
      return NextResponse.json<SuggestResponse>({ success: true, data: sets })
    } catch (err) {
      console.error('suggest-milestones generative path failed:', err instanceof Error ? err.name : 'error')
      const sets = fromLocalSets(refresh, intake)
      return NextResponse.json<SuggestResponse>({
        success: true,
        data: sets,
        degraded: true,
        warning:
          'Catalyst used a structured milestone fallback because generative suggestions were unavailable.',
      })
    }
  } catch (error) {
    const auth = authErrorResponse(error)
    if (auth) return auth
    console.error('suggest-milestones error:', error instanceof Error ? error.name : 'error')
    return NextResponse.json<SuggestResponse>({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
