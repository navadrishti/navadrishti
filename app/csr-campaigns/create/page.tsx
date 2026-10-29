'use client'

import { readApiError } from '@/lib/user-facing-error'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

import { Header } from '@/components/header'
import ProtectedRoute from '@/components/protected-route'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/lib/auth-context'
import { isCaVerifiedAccount } from '@/lib/auth'
import { AGENT_NAMES, AGENT_ROUTES } from '@/lib/ai-agent-sessions'
import { useToast } from '@/hooks/use-toast'
import { buildSuggestedMilestoneSets } from '@/app/companies/csr-agent/helpers'
import { fetchCampaignRow } from '@/app/companies/csr-agent/api'
import { useCapabilityRentals } from '@/app/companies/csr-agent/use-capability-rentals'
import type { ProjectSuggestion } from '@/app/companies/csr-agent/session'

import { CampaignFormFields } from './form-fields'
import {
  applyProjectSuggestion,
  campaignRowToManualForm,
  createEmptyCampaignForm,
  readManualCampaignExtras,
  stateForCity,
  toProjectIntake,
  validateManualCampaign,
  type ManualCampaignForm,
} from './helpers'
import { SuggestionsSidebar } from './suggestions-sidebar'
import { useCampaignDraft } from './use-campaign-draft'
import { useCampaignSuggestions } from './use-campaign-suggestions'

export default function CreateCsrCampaignPage() {
  const router = useRouter()
  const { user, token } = useAuth()
  const { toast } = useToast()
  const [form, setForm] = useState<ManualCampaignForm>(() => createEmptyCampaignForm())
  const [error, setError] = useState('')
  const [draftCampaignId, setDraftCampaignId] = useState<string | null>(null)
  const [publishedCampaignId, setPublishedCampaignId] = useState<string | null>(null)
  const [invitedOfferIds, setInvitedOfferIds] = useState<number[]>([])
  const [showingMilestoneSuggestions, setShowingMilestoneSuggestions] = useState(false)
  const [refreshingMilestones, setRefreshingMilestones] = useState(false)
  const [suggestedSets, setSuggestedSets] = useState(() => buildSuggestedMilestoneSets(toProjectIntake(form)))
  const hydratedCampaignId = useRef<string | null>(null)

  const suggestions = useCampaignSuggestions({
    form,
    token,
    userId: user?.id,
    draftCampaignId,
    setDraftCampaignId,
  })
  const draft = useCampaignDraft({
    form,
    token,
    userId: user?.id,
    selectedProjectId: suggestions.selectedProjectId,
    invitedOfferIds,
    draftCampaignId,
    setDraftCampaignId,
  })

  const formComplete = !validateManualCampaign(form)

  useEffect(() => {
    if (!token || !user?.id) return
    const campaignId = new URLSearchParams(window.location.search).get('campaign_id')?.trim()
    if (!campaignId || hydratedCampaignId.current === campaignId) return
    hydratedCampaignId.current = campaignId

    const hydrate = async () => {
      const campaign = await fetchCampaignRow(campaignId, token)
      if (!campaign) {
        setError('Could not load that campaign draft.')
        return
      }
      if (String(campaign.status || '').toLowerCase() !== 'draft') {
        setError('Only draft campaigns can be edited here.')
        return
      }
      const metrics =
        campaign.impact_metrics && typeof campaign.impact_metrics === 'object'
          ? (campaign.impact_metrics as Record<string, unknown>)
          : {}
      setForm(campaignRowToManualForm({ ...campaign, impact_metrics: metrics }))
      setDraftCampaignId(String(campaign.id))
      const extras = readManualCampaignExtras({ impact_metrics: metrics })
      setInvitedOfferIds(extras.invitedOfferIds)
      if (extras.selectedProjectId) suggestions.setSelectedProjectId(extras.selectedProjectId)
    }

    void hydrate()
  }, [token, user?.id, suggestions.setSelectedProjectId])

  const linkedProjectTitle = useMemo(() => {
    if (!suggestions.selectedProjectId) return null
    return suggestions.projectSuggestions.find((project) => project.id === suggestions.selectedProjectId)?.title || null
  }, [suggestions.projectSuggestions, suggestions.selectedProjectId])

  const rentals = useCapabilityRentals({
    user,
    token,
    campaignId: draftCampaignId,
    ensureCampaignId: async () => draftCampaignId || draft.saveDraft(),
    actionsEnabled: formComplete,
    leadAccepted: Boolean(suggestions.acceptedLead),
    appendAssistantMessage: (content) => toast({ title: 'Campaign', description: content }),
    onOfferInvited: (offerId) => setInvitedOfferIds((current) => [...new Set([...current, offerId])]),
    onPaymentVerified: (offerId) => setInvitedOfferIds((current) => [...new Set([...current, offerId])]),
  })

  const updateForm = (update: ManualCampaignForm | ((current: ManualCampaignForm) => ManualCampaignForm)) => {
    setForm((current) => {
      const next = typeof update === 'function' ? update(current) : update
      if (next.city !== current.city) {
        return { ...next, state: stateForCity(next.city, next.state) }
      }
      return next
    })
  }

  const refreshMilestoneSuggestions = () => {
    setRefreshingMilestones(true)
    setSuggestedSets(buildSuggestedMilestoneSets(toProjectIntake(form), true))
    setRefreshingMilestones(false)
  }

  const handleSelectProject = (project: ProjectSuggestion) => {
    suggestions.setSelectedProjectId(project.id)
    updateForm((current) => applyProjectSuggestion(current, project))
  }

  const ensureValidDraft = async () => {
    const validationError = validateManualCampaign(form)
    if (validationError) {
      setError(validationError)
      throw new Error(validationError)
    }
    setError('')
    return draft.saveDraft()
  }

  const handleSaveDraft = async () => {
    try {
      const id = await ensureValidDraft()
      toast({ title: 'Draft saved', description: 'Invite a lead NGO from the directory on the right. You can publish after they accept.' })
      return id
    } catch (saveError) {
      const message = readApiError(saveError, 'Failed to save campaign draft')
      setError(message)
      return null
    }
  }

  const handleToggleInvite = async (ngo: Parameters<typeof suggestions.toggleLeadInvite>[0]) => {
    try {
      const campaignId = await ensureValidDraft()
      const result = await suggestions.toggleLeadInvite(ngo, campaignId)
      if (result.error) {
        setError(result.error)
        return
      }
      toast({
        title: result.invited ? 'Lead NGO invited' : 'Invite removed',
        description: result.invited
          ? `${ngo.name} can accept from their dashboard. Publish becomes available after they accept.`
          : `Removed the invite for ${ngo.name}.`,
      })
    } catch (inviteError) {
      setError(readApiError(inviteError, 'Failed to update lead NGO invite'))
    }
  }

  const handlePublish = async () => {
    if (!suggestions.acceptedLead) {
      setError('A lead NGO must accept the invite from their dashboard before this campaign can be published.')
      return
    }
    try {
      const campaignId = await ensureValidDraft()
      const publishedId = await draft.publishDraft(campaignId)
      setPublishedCampaignId(publishedId)
      toast({ title: 'Campaign published', description: 'It is now listed on CSR Campaigns.' })
      router.push(`/csr-campaigns/${publishedId}`)
    } catch (publishError) {
      setError(readApiError(publishError, 'Failed to publish campaign'))
    }
  }

  return (
    <ProtectedRoute userTypes={['company']} requireVerification={true}>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 px-4 py-6 sm:px-6 md:px-10">
          <div className="mb-8">
            <Button
              variant="ghost"
              onClick={() => router.back()}
              className="mb-4 px-0 text-sm text-muted-foreground hover:bg-transparent hover:text-foreground"
            >
              <ArrowLeft size={16} className="mr-2" />
              Back
            </Button>
            <h1 className="text-3xl font-bold tracking-tight">Create a CSR campaign</h1>
            <p className="text-muted-foreground">
              Fill campaign details, then browse listed NGO projects, capability offers, and NGOs. Matching stays in{' '}
              {AGENT_NAMES.catalyst}, {AGENT_NAMES.pulse}, and {AGENT_NAMES.atlas}.{' '}
              <Link href={AGENT_ROUTES.catalyst} className="text-primary underline-offset-4 hover:underline">
                Use {AGENT_NAMES.catalyst} instead
              </Link>
              .
            </p>
          </div>

          <div className="mx-auto w-full max-w-7xl">
            <Card>
              <CardHeader>
                <CardTitle>Campaign details</CardTitle>
                <CardDescription>
                  The directory on the right lists available NGO projects, capability offers, and NGOs. Search or filter, then use a project, reserve an offer, or invite a lead NGO.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {error ? (
                  <div className="mb-6 rounded-md border border-red-200 bg-red-50 p-4">
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                ) : null}

                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
                  <CampaignFormFields
                    form={form}
                    onChange={updateForm}
                    suggestedSets={suggestedSets}
                    showingSuggestions={showingMilestoneSuggestions}
                    refreshingSuggestions={refreshingMilestones}
                    onToggleSuggestions={() => {
                      setShowingMilestoneSuggestions((current) => !current)
                      setSuggestedSets(buildSuggestedMilestoneSets(toProjectIntake(form)))
                    }}
                    onRefreshSuggestions={refreshMilestoneSuggestions}
                    onSelectSuggestedSet={(index) => {
                      const set = suggestedSets[index]
                      if (!set) return
                      updateForm((current) => ({ ...current, milestones: set.milestones }))
                      setShowingMilestoneSuggestions(false)
                    }}
                  />
                  <SuggestionsSidebar
                    projectSuggestions={suggestions.projectSuggestions}
                    loadingProjects={suggestions.loadingProjects}
                    selectedProjectId={suggestions.selectedProjectId}
                    onSelectProject={handleSelectProject}
                    serviceSuggestions={suggestions.serviceSuggestions}
                    loadingServices={suggestions.loadingServices}
                    serviceError={suggestions.serviceError}
                    actionsEnabled={formComplete}
                    leadAccepted={Boolean(suggestions.acceptedLead)}
                    payingOfferId={rentals.payingOfferId}
                    paidOfferIds={rentals.paidOfferIds}
                    paidRentals={rentals.paidRentalsByOfferId}
                    rentalCampaignId={draftCampaignId || ''}
                    onPayAndReserve={rentals.handlePayAndReserveOffer}
                    onRentalUpdated={rentals.refreshPaidRental}
                    payerVerified={isCaVerifiedAccount(user?.verification_status)}
                    ngos={suggestions.ngoDirectory}
                    loadingNgos={suggestions.loadingNgos}
                    invites={suggestions.leadNgoInvites}
                    acceptedLead={suggestions.acceptedLead}
                    linkedProjectTitle={linkedProjectTitle}
                    onToggleInvite={(ngo) => void handleToggleInvite(ngo)}
                    inviteError={suggestions.inviteError}
                  />
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <Button type="button" disabled={draft.saving || Boolean(publishedCampaignId)} onClick={() => void handleSaveDraft()} className="w-full flex-1">
                    {draft.saving ? 'Saving...' : draftCampaignId ? 'Update draft' : 'Save draft'}
                  </Button>
                  <Button
                    type="button"
                    disabled={!suggestions.acceptedLead || draft.publishing || Boolean(publishedCampaignId)}
                    onClick={() => void handlePublish()}
                    className="w-full flex-1"
                  >
                    {draft.publishing ? 'Publishing...' : publishedCampaignId ? 'Published' : 'Publish campaign'}
                  </Button>
                  <Button type="button" variant="outline" asChild className="w-full flex-1">
                    <Link href="/csr-campaigns">Cancel</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  )
}
