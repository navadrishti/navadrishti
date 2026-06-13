import { readCampaignCategory, readCampaignLocation } from '@/lib/campaign-schema'
import { stripHashtagPrefix } from '@/lib/hashtag-utils'

type CampaignSocialPostInput = {
  title?: string | null
  description?: string | null
  category?: string | null
  location?: string | null
  schedule_vii?: string | null
  start_date?: string | null
  end_date?: string | null
  lead_ngo_name?: string | null
  campaign_url: string
}

function formatPostDate(value?: string | null): string {
  const text = String(value || '').trim()
  if (!text) return 'TBD'
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) return `${match[3]}/${match[2]}/${match[1]}`
  return text
}

function slugHashtag(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9]/g, '')
  return cleaned ? cleaned.slice(0, 32) : 'CSR'
}

function excerpt(text: string, max = 280): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1).trim()}…`
}

export function buildCampaignSocialPost(input: CampaignSocialPostInput): string {
  const title = String(input.title || readCampaignCategory(input) || 'CSR Campaign').trim()
  const category = readCampaignCategory(input) || 'Community development'
  const location = readCampaignLocation(input) || 'India'
  const description = excerpt(String(input.description || '').trim() || 'A new corporate social responsibility campaign is now live on Navadrishti.')
  const leadNgo = String(input.lead_ngo_name || '').trim()
  const timeline = `${formatPostDate(input.start_date)} → ${formatPostDate(input.end_date)}`
  const categoryTag = slugHashtag(category)

  const lines = [
    'New CSR Campaign on Navadrishti',
    '',
    title,
    '',
    description,
    '',
    `Location: ${location}`,
    `Timeline: ${timeline}`,
    `Focus: ${category}`,
  ]

  if (leadNgo) {
    lines.push(`Lead NGO: ${leadNgo}`)
  }

  lines.push(
    '',
    'Volunteer, partner, or follow the campaign here:',
    input.campaign_url,
    '',
    `#CSR #SocialImpact #Campaign #${categoryTag} #Navadrishti`,
  )

  return lines.join('\n')
}

export function buildCampaignSocialTags(input: CampaignSocialPostInput): string[] {
  const category = readCampaignCategory(input)
  return [
    'CSR',
    'SocialImpact',
    'Campaign',
    slugHashtag(category || 'CSR'),
    'Navadrishti',
  ].map((tag) => stripHashtagPrefix(tag))
}

export function resolveAppOrigin(request: { headers: { get(name: string): string | null } }): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL
  if (envUrl) return envUrl.replace(/\/$/, '')
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host')
  const proto = request.headers.get('x-forwarded-proto') || 'http'
  return host ? `${proto}://${host}` : 'http://localhost:3000'
}
