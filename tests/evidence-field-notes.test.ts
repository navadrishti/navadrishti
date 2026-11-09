import { describe, expect, it } from 'vitest'
import {
  mapSubmissionNotesToDescription,
  resolveFieldOfficerNotes,
} from '@/lib/evidence-field-notes'

describe('mapSubmissionNotesToDescription', () => {
  it('maps PWA/sync notes into csr_milestone_evidence.description', () => {
    expect(mapSubmissionNotesToDescription('  Site visit complete.\nGate locked.  ')).toBe(
      'Site visit complete.\nGate locked.'
    )
  })

  it('returns null for blank or non-string notes', () => {
    expect(mapSubmissionNotesToDescription('   ')).toBeNull()
    expect(mapSubmissionNotesToDescription(null)).toBeNull()
    expect(mapSubmissionNotesToDescription(12)).toBeNull()
  })
})

describe('resolveFieldOfficerNotes', () => {
  it('prefers persisted description from the evidence row', () => {
    expect(
      resolveFieldOfficerNotes({
        description: 'Line one\nLine two',
        evidence_summary: { notes: 'ignored fallback' },
      })
    ).toBe('Line one\nLine two')
  })

  it('falls back to evidence_summary notes when description is empty', () => {
    expect(
      resolveFieldOfficerNotes({
        description: '  ',
        evidence_summary: { notes: '  Offline-only notes\nwith break  ' },
      })
    ).toBe('Offline-only notes\nwith break')
  })

  it('returns null when no notes were provided', () => {
    expect(resolveFieldOfficerNotes({ description: null, evidence_summary: {} })).toBeNull()
  })
})

describe('CA review Field Notes display contract', () => {
  function fieldNotesLabel(evidence: { description?: string | null; evidence_summary?: unknown }) {
    return resolveFieldOfficerNotes(evidence) || 'No notes provided'
  }

  it('always surfaces a Field Notes value distinct from reviewer comments', () => {
    expect(
      fieldNotesLabel({
        description: 'Installed water filter.\nPhoto from north side.',
      })
    ).toBe('Installed water filter.\nPhoto from north side.')
    expect(fieldNotesLabel({ description: null })).toBe('No notes provided')
  })

  it('survives submission → persistence → retrieval shape used by GET /api/milestones/[id]', () => {
    const submittedNotes = 'Gate locked after delivery.\nGPS verified.'
    const persisted = {
      description: mapSubmissionNotesToDescription(submittedNotes),
      evidence_summary: {
        source: 'field_pwa',
        beneficiary_name: 'Asha Patil',
      },
      media: [{ id: 'm1', media_url: 'https://example.test/a.jpg' }],
    }

    expect(persisted.description).toBe(submittedNotes)
    expect(resolveFieldOfficerNotes(persisted)).toBe(submittedNotes)
    expect(fieldNotesLabel(persisted)).toBe(submittedNotes)
    expect(persisted.media).toHaveLength(1)
  })
})
