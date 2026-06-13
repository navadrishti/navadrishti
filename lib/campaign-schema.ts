type CampaignLike = Record<string, unknown> | null | undefined

export function readCampaignCategory(row: CampaignLike): string {
  if (!row) return ''
  return String(row.category || row.schedule_vii || row.cause || '').trim()
}

export function readCampaignLocation(row: CampaignLike): string {
  if (!row) return ''
  return String(row.location || row.region || '').trim()
}

export function readCampaignDuration(row: CampaignLike): string {
  if (!row) return ''
  const impact = row.impact_metrics && typeof row.impact_metrics === 'object'
    ? row.impact_metrics as Record<string, unknown>
    : {}
  return String(impact.duration || '').trim()
}

export function resolveCampaignCategoryInput(body: Record<string, unknown>): string {
  return String(body.category || body.cause || body.schedule_vii || '').trim()
}

export function resolveCampaignLocationInput(body: Record<string, unknown>): string {
  return String(body.location || body.region || '').trim()
}

export function buildCampaignWritePayload(body: Record<string, unknown>, companyId: number) {
  const category = resolveCampaignCategoryInput(body)
  const location = resolveCampaignLocationInput(body)

  return {
    company_id: companyId,
    title: body.title,
    description: body.description ?? null,
    category,
    location,
    budget_inr: body.budget_inr ?? null,
    budget_breakdown: body.budget_breakdown ?? {},
    schedule_vii: (body.schedule_vii ?? category) || null,
    sdg_alignment: body.sdg_alignment ?? [],
    impact_metrics: body.impact_metrics ?? {},
    milestones: body.milestones ?? [],
    start_date: body.start_date ?? null,
    end_date: body.end_date ?? null,
    ...(body.status ? { status: body.status } : {}),
  }
}
