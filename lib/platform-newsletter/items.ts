import { getProjectLeadNgoId } from '@/lib/db'
import { getAdminModeration } from '@/lib/auth'
import { parseJsonObject } from '@/lib/utils'
import {
  actorFromUser,
  firstRecord,
  isoOrNull,
  joinNames,
  resolveActorName,
  trimText,
  type ActorSource,
  type NewsletterItem,
} from './actors'
import type { NewsletterLookups, NewsletterSources } from './sources'

type PushItem = (item: NewsletterItem) => void

function pushAccountItems(sources: NewsletterSources, lookups: NewsletterLookups, pushItem: PushItem) {
  for (const user of sources.users) {
    const actor = actorFromUser(user)
    pushItem({
      id: `joined-${user.id}`,
      kind: 'joined',
      ...actor,
      title: `${actor.actorName} joined GRAM`,
      summary: '',
      href: null,
      createdAt: String(user.created_at),
    })
  }

  for (const user of sources.verifiedUsers) {
    const createdAt =
      isoOrNull(user.verified_at) ||
      lookups.verificationDateByUserId[Number(user.id || 0)]
    if (!createdAt) continue
    const actor = actorFromUser(user)
    pushItem({
      id: `verified-${user.id}-${createdAt}`,
      kind: 'verified',
      ...actor,
      title: `${actor.actorName} was verified on GRAM`,
      summary: '',
      href: null,
      createdAt,
    })
  }

  for (const user of sources.unverifiedUsers) {
    const createdAt = isoOrNull(user.updated_at) || isoOrNull(user.verified_at)
    if (!createdAt) continue
    const actor = actorFromUser(user)
    pushItem({
      id: `unverified-${user.id}-${createdAt}`,
      kind: 'unverified',
      ...actor,
      title: `${actor.actorName} was unverified on GRAM`,
      summary: '',
      href: null,
      createdAt,
    })
  }

  for (const user of sources.statusUsers) {
    const createdAt = isoOrNull(user.updated_at)
    if (!createdAt) continue
    const actor = actorFromUser(user)
    const accountStatus = String(user.account_status || '').toLowerCase()
    const moderation = getAdminModeration(user.profile_data)
    const banned = accountStatus === 'banned' || moderation.permanently_banned === true
    const suspended = !banned && accountStatus === 'suspended'
    const days = Number(moderation.suspend_days || 0)
    const until = isoOrNull(moderation.suspended_until) || isoOrNull(user.locked_until)

    if (banned) {
      pushItem({
        id: `banned-${user.id}-${createdAt}`,
        kind: 'banned',
        ...actor,
        title: `${actor.actorName} was banned from GRAM`,
        summary: '',
        href: null,
        createdAt,
      })
      continue
    }

    if (suspended) {
      const durationLabel = days > 0
        ? ` for ${days} day${days === 1 ? '' : 's'}`
        : until
          ? ` until ${new Date(until).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}`
          : ''
      pushItem({
        id: `suspended-${user.id}-${createdAt}`,
        kind: 'suspended',
        ...actor,
        title: `${actor.actorName} was suspended${durationLabel} on GRAM`,
        summary: '',
        href: null,
        createdAt,
      })
    }
  }
}

function pushListingItems(sources: NewsletterSources, lookups: NewsletterLookups, pushItem: PushItem) {
  const { usersById } = lookups

  for (const request of sources.requests) {
    const requester = firstRecord(request.requester) as ActorSource | null
    const actor = actorFromUser(requester)
    pushItem({
      id: `need-${request.id}`,
      kind: 'need',
      ...actor,
      title: `${actor.actorName} posted a new NGO need`,
      summary: trimText(request.title || request.location || request.description || 'A new need is now live on the platform.'),
      href: `/service-requests/${request.id}`,
      createdAt: String(request.created_at),
    })
  }

  for (const offer of sources.offers) {
    const ngo = firstRecord(offer.ngo) as ActorSource | null
    const actor = actorFromUser(ngo)
    pushItem({
      id: `capability-${offer.id}`,
      kind: 'capability',
      ...actor,
      title: `${actor.actorName} posted a new capability offer`,
      summary: trimText(
        offer.title ||
          [offer.city, offer.state_province, offer.coverage_area].filter(Boolean).join(', ') ||
          offer.description ||
          'A new capability offer is now live on the platform.'
      ),
      href: `/service-offers/${offer.id}`,
      createdAt: String(offer.created_at),
    })
  }

  for (const campaign of sources.campaigns) {
    const company = usersById[Number(campaign.company_id || 0)]
    const actor = actorFromUser(company || { name: 'A company', user_type: 'company', id: campaign.company_id })
    pushItem({
      id: `campaign-${campaign.id}`,
      kind: 'campaign',
      ...actor,
      title: `${actor.actorName} launched a CSR campaign`,
      summary: trimText(campaign.title || campaign.location || campaign.description || 'A new CSR campaign is now live on the platform.'),
      href: `/csr-campaigns/${campaign.id}`,
      createdAt: String(campaign.created_at),
    })
  }
}

function pushOutcomeItems(sources: NewsletterSources, lookups: NewsletterLookups, pushItem: PushItem) {
  const { usersById, fulfillersByNeedId } = lookups

  for (const campaign of sources.finishedCampaigns) {
    const company = usersById[Number(campaign.company_id || 0)]
    const actor = actorFromUser(company || { name: 'A company', user_type: 'company', id: campaign.company_id })
    pushItem({
      id: `campaign-finished-${campaign.id}`,
      kind: 'campaign_finished',
      ...actor,
      title: `${actor.actorName} finished a CSR campaign`,
      summary: trimText(campaign.title || campaign.location || campaign.description || 'A CSR campaign has been completed on GRAM.'),
      href: `/csr-campaigns/${campaign.id}`,
      // updated_at moves on any campaign write (volunteers, edits), which would resurface old events.
      createdAt:
        isoOrNull(parseJsonObject(campaign.impact_metrics).completed_at) ||
        isoOrNull(campaign.end_date) ||
        String(campaign.created_at),
    })
  }

  for (const need of sources.fulfilledNeeds) {
    const requester = firstRecord(need.requester) as ActorSource | null
    const actor = actorFromUser(requester)
    const fulfillers = joinNames(fulfillersByNeedId[Number(need.id || 0)] || [])
    pushItem({
      id: `need-fulfilled-${need.id}`,
      kind: 'need_fulfilled',
      ...actor,
      title: `${actor.actorName}'s need was fulfilled by ${fulfillers}`,
      summary: trimText(need.title || need.location || need.description || ''),
      href: `/service-requests/${need.id}`,
      createdAt: isoOrNull(need.completed_at) || isoOrNull(need.updated_at) || String(need.created_at),
    })
  }

  for (const campaign of sources.leadCampaigns) {
    const company = usersById[Number(campaign.company_id || 0)]
    const actor = actorFromUser(company || { name: 'A company', user_type: 'company', id: campaign.company_id })
    const leadId = Number(campaign.lead_ngo_user_id || 0)
    const lead = usersById[leadId]
    const leadName = lead
      ? resolveActorName(lead.name, lead.user_type, lead.profile_data)
      : 'an NGO'
    pushItem({
      id: `lead-ngo-${campaign.id}-${leadId || 'ngo'}`,
      kind: 'lead_ngo',
      ...actor,
      title: `${actor.actorName} selected ${leadName} as lead NGO`,
      summary: trimText(campaign.title || 'The invite was accepted on GRAM.'),
      href: `/csr-campaigns/${campaign.id}`,
      createdAt:
        isoOrNull(parseJsonObject(campaign.impact_metrics).lead_ngo_accepted_at) ||
        isoOrNull(parseJsonObject(campaign.impact_metrics).published_at) ||
        String(campaign.created_at),
    })
  }

  for (const project of sources.assignedProjects) {
    const company = usersById[Number(project.assigned_company_user_id || 0)]
    const ngo = usersById[getProjectLeadNgoId(project) || Number(project.ngo_id || 0)]
    const actor = actorFromUser(company || { name: 'A company', user_type: 'company', id: project.assigned_company_user_id })
    const ngoName = ngo ? resolveActorName(ngo.name, ngo.user_type, ngo.profile_data) : 'an NGO'
    pushItem({
      id: `csr-assigned-${project.id}`,
      kind: 'csr_project',
      ...actor,
      title: `${actor.actorName} undertook ${ngoName}'s project as CSR`,
      summary: trimText(project.title || project.location || project.description || ''),
      href: `/service-requests/projects/${project.id}`,
      createdAt: lookups.assignedAtByProjectId[String(project.id)] || String(project.created_at),
    })
  }

  for (const project of sources.csrProjects) {
    const company = usersById[Number(project.company_user_id || 0)]
    const ngo = usersById[Number(project.ngo_user_id || 0)]
    const actor = actorFromUser(company || { name: 'A company', user_type: 'company', id: project.company_user_id })
    const ngoName = ngo ? resolveActorName(ngo.name, ngo.user_type, ngo.profile_data) : 'an NGO'
    pushItem({
      id: `csr-project-${project.id}`,
      kind: 'csr_project',
      ...actor,
      title: `${actor.actorName} undertook a CSR project with ${ngoName}`,
      summary: trimText(project.title || project.description || ''),
      href: project.campaign_id ? `/csr-campaigns/${project.campaign_id}` : null,
      createdAt: isoOrNull(project.acceptance_date) || isoOrNull(project.created_at) || String(project.updated_at || ''),
    })
  }
}

export function buildNewsletterItems(sources: NewsletterSources, lookups: NewsletterLookups) {
  const items: NewsletterItem[] = []

  const pushItem = (item: NewsletterItem) => {
    if (!item.createdAt) return
    items.push(item)
  }

  pushAccountItems(sources, lookups, pushItem)
  pushListingItems(sources, lookups, pushItem)
  pushOutcomeItems(sources, lookups, pushItem)

  return items
    .filter((item) => Boolean(item.createdAt))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}
