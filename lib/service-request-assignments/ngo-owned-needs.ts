/**
 * NGO "My Needs" = standalone needs owned by the NGO (ngo_id),
 * not company CSR handoffs / project-locked rows (those live under My Projects).
 *
 * Ongoing vs History uses needBelongsInHistory — capacity + physical completion,
 * not "has an application" alone. Owned needs with zero applications still appear
 * in Ongoing when they are open.
 */

import {
  isNeedFullyFulfilled,
  isNeedPhysicallyComplete,
  needBelongsInHistory,
} from '@/lib/service-request-allocation'
import {
  isCompanyAssignedNeed,
  isProjectLocked,
} from '@/lib/service-requests/list-shape'

export type NgoOwnedNeedAssignmentLike = {
  id?: unknown
  service_request_id?: unknown
  status?: unknown
  response_meta?: unknown
  ngo_confirmed_at?: unknown
  [key: string]: unknown
}

export type NgoOwnedNeedLike = {
  id: number | string
  status?: unknown
  request_type?: unknown
  category?: unknown
  remaining_quantity?: unknown
  remaining_amount?: unknown
  target_quantity?: unknown
  target_amount?: unknown
  project_context?: unknown
  requirements?: unknown
  assignments?: NgoOwnedNeedAssignmentLike[]
  accepted_count?: number
  pending_count?: number
  completed_count?: number
  [key: string]: unknown
}

export function isStandaloneNgoOwnedNeed(request: unknown): boolean {
  if (!request || typeof request !== 'object') return false
  const row = request as { project_context?: unknown; requirements?: unknown }
  return !isCompanyAssignedNeed(row) && !isProjectLocked(row)
}

export function shapeNgoOwnedNeedWithAssignments<
  TRequest extends NgoOwnedNeedLike,
  TAssignment extends NgoOwnedNeedAssignmentLike,
>(request: TRequest, assignments: TAssignment[]): TRequest & {
  assignments: TAssignment[]
  accepted_count: number
  pending_count: number
  completed_count: number
} {
  const related = assignments.filter(
    (assignment) => String(assignment.service_request_id) === String(request.id)
  )

  return {
    ...request,
    assignments: related,
    accepted_count: related.filter((item) =>
      ['accepted', 'active', 'completed'].includes(String(item.status || '').toLowerCase())
    ).length,
    pending_count: related.filter(
      (item) => String(item.status || '').toLowerCase() === 'pending'
    ).length,
    completed_count: related.filter((item) => {
      const status = String(item.status || '').toLowerCase()
      return status === 'completed' || Boolean(item.ngo_confirmed_at)
    }).length,
  }
}

export function partitionNgoOwnedNeeds<T extends NgoOwnedNeedLike>(
  needs: T[]
): { ongoing: T[]; history: T[] } {
  const ongoing: T[] = []
  const history: T[] = []

  for (const need of needs) {
    if (needBelongsInHistory(need, need.assignments || [])) {
      history.push(need)
    } else {
      ongoing.push(need)
    }
  }

  return { ongoing, history }
}

/** Fully allocated need ids — used to auto-reject leftover pending applications. */
export function listFullyAllocatedOwnedNeedIds(
  needs: Array<Pick<NgoOwnedNeedLike, 'id' | 'status' | 'request_type' | 'category' | 'remaining_quantity' | 'remaining_amount' | 'target_quantity' | 'target_amount'>>
): Set<number> {
  return new Set(
    needs
      .filter((item) => isNeedFullyFulfilled(item))
      .map((item) => Number(item.id))
      .filter((id) => Number.isFinite(id) && id > 0)
  )
}

export function shouldMarkOwnedNeedCompleted(
  need: NgoOwnedNeedLike
): boolean {
  const status = String(need.status || '').toLowerCase()
  if (!['active', 'in_progress'].includes(status)) return false
  return isNeedPhysicallyComplete(need, need.assignments || [])
}
