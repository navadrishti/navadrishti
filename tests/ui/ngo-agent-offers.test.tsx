import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RequestPreview } from '@/app/ngos/ai-agent/request-preview'
import { buildEmptySession, deriveSessionTitle, type RelatedOfferEntry, type ServiceRequestDraftPayload } from '@/app/ngos/ai-agent/intake'

const need: ServiceRequestDraftPayload['needs'][number] = {
  title: 'Solar lamps',
  description: 'Lamps for evening classes',
  request_type: 'Skill / Service Need',
  category: 'Education',
  urgency: 'Critical',
  timeline: '1 month',
  budget: '',
  estimated_budget: '',
  beneficiary_count: '200',
  impact_description: '',
  contactInfo: '',
} as ServiceRequestDraftPayload['needs'][number]

const draft = {
  source: 'ngo-ai-agent',
  projectMode: 'new',
  project: { title: 'Solar lamps', description: '', location: 'Pune', timeline: '1 month', category: 'Education' },
  needs: [need],
} as ServiceRequestDraftPayload

const offer = (id: number, title: string): RelatedOfferEntry => ({
  offer: { id, title, provider_name: 'TechCorp Solutions' } as RelatedOfferEntry['offer'],
  score: 14,
  capacity: 1,
  coverageRatio: null,
})

function renderPreview(selectedIds: number[]) {
  const handlers = { onApplyAll: vi.fn(), onRemoveAll: vi.fn(), onToggleOffer: vi.fn() }
  render(
    <RequestPreview
      generatedDraft={draft}
      intakePath="need"
      projectData={{}}
      needsData={[]}
      answeredQuestions={5}
      answeredProjectQuestions={0}
      relatedOffersByNeed={{ 0: [offer(1, 'Solar Installation'), offer(2, 'Wiring Support')] }}
      selectedOfferIdsByNeed={{ 0: selectedIds }}
      offersLoading={false}
      publishingDraft={false}
      onPublish={vi.fn()}
      {...handlers}
    />,
  )
  return handlers
}

function offerRow(title: string) {
  const row = screen.getByRole('link', { name: title }).closest('div.rounded-md')
  if (!(row instanceof HTMLElement)) throw new Error(`row for ${title} not found`)
  return row
}

describe('NGO agent related offers', () => {
  it('offers Apply for unselected offers and Remove for selected ones', async () => {
    const handlers = renderPreview([1])
    const selected = within(offerRow('Solar Installation'))
    expect(selected.getByText('Selected')).toBeInTheDocument()
    await userEvent.click(selected.getByRole('button', { name: 'Remove' }))
    expect(handlers.onToggleOffer).toHaveBeenCalledWith(0, 1)

    const other = within(offerRow('Wiring Support'))
    expect(other.queryByText('Selected')).not.toBeInTheDocument()
    await userEvent.click(other.getByRole('button', { name: 'Apply' }))
    expect(handlers.onToggleOffer).toHaveBeenCalledWith(0, 2)
    expect(screen.queryByText(/invite/i)).not.toBeInTheDocument()
  })

  it('applies to all and removes all', async () => {
    const handlers = renderPreview([1])
    expect(screen.getByText('1 selected')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Apply to all' }))
    expect(handlers.onApplyAll).toHaveBeenCalledWith(0)
    await userEvent.click(screen.getByRole('button', { name: 'Remove all' }))
    expect(handlers.onRemoveAll).toHaveBeenCalledWith(0)
  })

  it('disables the bulk buttons when they have nothing to do', () => {
    renderPreview([])
    expect(screen.getByRole('button', { name: 'Remove all' })).toBeDisabled()
  })

  it('shows All selected once every offer is chosen', () => {
    renderPreview([1, 2])
    expect(screen.getByRole('button', { name: 'All selected' })).toBeDisabled()
  })
})

describe('NGO agent draft preview', () => {
  const renderDraft = (generatedDraft: ServiceRequestDraftPayload) =>
    render(
      <RequestPreview
        generatedDraft={generatedDraft}
        intakePath="need"
        projectData={{}}
        needsData={[]}
        answeredQuestions={5}
        answeredProjectQuestions={0}
        relatedOffersByNeed={{}}
        selectedOfferIdsByNeed={{}}
        offersLoading={false}
        publishingDraft={false}
        onPublish={vi.fn()}
        onApplyAll={vi.fn()}
        onRemoveAll={vi.fn()}
        onToggleOffer={vi.fn()}
      />,
    )

  it('lists every need detail under a matching heading', () => {
    renderDraft(draft)
    expect(screen.getByText('Need details')).toBeInTheDocument()
    expect(screen.queryByText('Generated needs')).not.toBeInTheDocument()
    expect(screen.getByText('Type')).toBeInTheDocument()
    expect(screen.getByText('Critical')).toBeInTheDocument()
    expect(screen.getByText('Skill / Service Need • Critical • 200 beneficiaries')).toBeInTheDocument()
  })

  it('does not render empty cards or placeholder values', () => {
    const bare = { title: 'Solar lamps', request_type: '', urgency: '', beneficiary_count: '' } as unknown as typeof need
    const { unmount } = renderDraft({ ...draft, needs: [bare] })
    expect(screen.queryByText('Need details')).not.toBeInTheDocument()
    expect(screen.queryByText(/beneficiaries|undefined|N\/A/)).not.toBeInTheDocument()
    unmount()

    renderDraft({ ...draft, needs: [] })
    expect(screen.queryByText('Need list')).not.toBeInTheDocument()
  })
})

describe('deriveSessionTitle', () => {
  const base = buildEmptySession()
  const messages = [...base.messages, { role: 'user' as const, content: 'Project' }]

  it('uses the project title for projects', () => {
    expect(deriveSessionTitle({ ...base, messages, intakePath: 'project', projectData: { projectTitle: '  Clean Water Drive ' } })).toBe('Clean Water Drive')
  })

  it('uses the need title for standalone needs', () => {
    const needsData = [{ title: 'Solar lamps' }] as typeof base.needsData
    expect(deriveSessionTitle({ ...base, messages, intakePath: 'need', needsData })).toBe('Solar lamps')
  })

  it('names the chat by path until a title is given', () => {
    expect(deriveSessionTitle({ ...base, messages, intakePath: 'project' })).toBe('New project')
    expect(deriveSessionTitle({ ...base, messages, intakePath: 'need' })).toBe('New need')
  })

  it('falls back to the first message before a path is chosen', () => {
    expect(deriveSessionTitle(base)).toBe('Untitled session')
    expect(deriveSessionTitle({ ...base, messages: [{ role: 'user', content: 'hello there' }] })).toBe('hello there')
  })
})
