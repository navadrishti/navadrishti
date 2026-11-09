/**
 * Field Officer notes from GRAM PWA are stored on csr_milestone_evidence.description
 * (mapped from payload data.notes). evidence_summary may carry related metadata only.
 */
export function resolveFieldOfficerNotes(evidence: {
  description?: string | null
  evidence_summary?: unknown
}): string | null {
  if (typeof evidence.description === 'string') {
    const trimmed = evidence.description.trim()
    if (trimmed) return evidence.description.replace(/^\s+|\s+$/g, '')
  }

  const summary =
    evidence.evidence_summary && typeof evidence.evidence_summary === 'object' && !Array.isArray(evidence.evidence_summary)
      ? (evidence.evidence_summary as Record<string, unknown>)
      : null
  const fallback = summary?.notes ?? summary?.field_notes ?? summary?.description
  if (typeof fallback === 'string' && fallback.trim()) {
    return fallback.replace(/^\s+|\s+$/g, '')
  }
  return null
}

/** Map PWA / sync payload notes into the csr_milestone_evidence.description column. */
export function mapSubmissionNotesToDescription(notes: unknown): string | null {
  if (typeof notes !== 'string') return null
  const trimmed = notes.trim()
  return trimmed ? trimmed : null
}
