import { randomBytes } from 'node:crypto'
import { getErrorMessage, type PlatformCheckoutPricing } from '@/lib/utils'

export const CSR_MILESTONE_INTENT_RESERVING_TTL_SECONDS = 120
export const CSR_MILESTONE_INTENT_READY_TTL_SECONDS = 24 * 60 * 60

export type CsrMilestonePaymentIntentAction = 'create' | 'wait' | 'reuse'

export type CsrMilestonePaymentIntentClaim = {
  action: CsrMilestonePaymentIntentAction
  intentId: string
  status: string
  razorpayOrderId: string | null
  expiresAt: string | null
}

export type CsrMilestonePaymentIntentObservation = {
  intentId: string
  status: string
  razorpayOrderId: string | null
  pricingFingerprint: string
  expiresAt: string | null
}

export type ClaimCsrMilestonePaymentIntentInput = {
  milestoneId: string
  projectId: string
  payerUserId: number
  ngoUserId: number
  amountPaise: number
  pricingFingerprint: string
  ownerToken: string
  ttlSeconds?: number
}

export type CsrMilestonePaymentIntentReleaseResult = {
  ok: boolean
  intentId: string | null
  status: string | null
  alreadyReleased: boolean
}

export type CsrMilestonePaymentIntentStore = {
  claim(input: ClaimCsrMilestonePaymentIntentInput): Promise<CsrMilestonePaymentIntentClaim>
  complete(input: {
    intentId: string
    ownerToken: string
    razorpayOrderId: string
    readyTtlSeconds?: number
  }): Promise<{ ok: boolean; status: string | null; razorpayOrderId: string | null }>
  fail(input: {
    intentId: string
    ownerToken: string
    errorMessage?: string | null
  }): Promise<{ ok: boolean; status: string | null }>
  /** After payment settlement: ready → released for the matching order identity. */
  release(input: {
    milestoneId: string
    razorpayOrderId: string
  }): Promise<CsrMilestonePaymentIntentReleaseResult>
  observe(milestoneId: string): Promise<CsrMilestonePaymentIntentObservation | null>
}

export function buildCsrMilestonePricingFingerprint(pricing: PlatformCheckoutPricing): string {
  return [
    'fee_on_top',
    `base:${pricing.baseAmountInr}`,
    `fee:${pricing.platformFeeInr}`,
    `feePct:${pricing.platformFeePercent}`,
    `gst:${pricing.gstOnPlatformFeeInr}`,
    `gstPct:${pricing.gstRatePercent}`,
    `total:${pricing.totalChargeInr}`,
    `paise:${pricing.totalChargePaise}`,
  ].join('|')
}

export function newCsrMilestonePaymentOwnerToken(): string {
  return randomBytes(16).toString('hex')
}

export function isMissingPaymentIntentRpc(error: unknown): boolean {
  const code =
    error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code || '') : ''
  if (['42883', 'PGRST202', 'PGRST205'].includes(code)) return true
  const message = getErrorMessage(error).toLowerCase()
  return (
    message.includes('claim_csr_milestone_payment_intent') ||
    message.includes('release_csr_milestone_payment_intent') ||
    message.includes('csr_milestone_payment_intents') ||
    message.includes('could not find the function') ||
    message.includes('does not exist')
  )
}

type MemoryIntentRow = {
  id: string
  milestoneId: string
  projectId: string
  payerUserId: number
  ngoUserId: number
  amountPaise: number
  pricingFingerprint: string
  status: 'reserving' | 'ready' | 'failed' | 'expired' | 'released'
  ownerToken: string
  razorpayOrderId: string | null
  errorMessage: string | null
  expiresAtMs: number
  createdAtMs: number
  updatedAtMs: number
}

/** Shared backend for multi-instance concurrency tests (separate clients, one store). */
export class SharedMemoryCsrMilestonePaymentIntentBackend {
  readonly rows = new Map<string, MemoryIntentRow>()
  private locks = new Map<string, Promise<void>>()
  nowMs = () => Date.now()

  async withLock<T>(milestoneId: string, work: () => Promise<T> | T): Promise<T> {
    const key = String(milestoneId)
    const previous = this.locks.get(key) ?? Promise.resolve()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const tail = previous.then(() => gate)
    this.locks.set(key, tail)
    await previous
    try {
      return await work()
    } finally {
      release()
      if (this.locks.get(key) === tail) this.locks.delete(key)
    }
  }

  expireDue(milestoneId: string) {
    const now = this.nowMs()
    for (const row of this.rows.values()) {
      if (row.milestoneId !== milestoneId) continue
      if ((row.status === 'reserving' || row.status === 'ready') && row.expiresAtMs <= now) {
        row.status = 'expired'
        row.updatedAtMs = now
      }
    }
  }

  activeForMilestone(milestoneId: string): MemoryIntentRow | null {
    const active = [...this.rows.values()]
      .filter((row) => row.milestoneId === milestoneId && (row.status === 'reserving' || row.status === 'ready'))
      .sort((a, b) => a.createdAtMs - b.createdAtMs)
    return active[0] ?? null
  }
}

export class MemoryCsrMilestonePaymentIntentStore implements CsrMilestonePaymentIntentStore {
  constructor(private readonly backend: SharedMemoryCsrMilestonePaymentIntentBackend) {}

  claim(input: ClaimCsrMilestonePaymentIntentInput): Promise<CsrMilestonePaymentIntentClaim> {
    return this.backend.withLock(input.milestoneId, () => {
      this.backend.expireDue(input.milestoneId)
      const existing = this.backend.activeForMilestone(input.milestoneId)
      if (existing) {
        if (
          existing.pricingFingerprint !== input.pricingFingerprint ||
          existing.payerUserId !== input.payerUserId ||
          existing.ngoUserId !== input.ngoUserId ||
          existing.projectId !== input.projectId ||
          existing.amountPaise !== input.amountPaise
        ) {
          existing.status = 'expired'
          existing.errorMessage = 'pricing_or_party_mismatch'
          existing.updatedAtMs = this.backend.nowMs()
        } else if (existing.status === 'ready' && existing.razorpayOrderId) {
          return {
            action: 'reuse' as const,
            intentId: existing.id,
            status: existing.status,
            razorpayOrderId: existing.razorpayOrderId,
            expiresAt: new Date(existing.expiresAtMs).toISOString(),
          }
        } else {
          return {
            action: 'wait' as const,
            intentId: existing.id,
            status: existing.status,
            razorpayOrderId: existing.razorpayOrderId,
            expiresAt: new Date(existing.expiresAtMs).toISOString(),
          }
        }
      }

      const now = this.backend.nowMs()
      const ttlSeconds = input.ttlSeconds ?? CSR_MILESTONE_INTENT_RESERVING_TTL_SECONDS
      const row: MemoryIntentRow = {
        id: randomBytes(16).toString('hex'),
        milestoneId: input.milestoneId,
        projectId: input.projectId,
        payerUserId: input.payerUserId,
        ngoUserId: input.ngoUserId,
        amountPaise: input.amountPaise,
        pricingFingerprint: input.pricingFingerprint,
        status: 'reserving',
        ownerToken: input.ownerToken,
        razorpayOrderId: null,
        errorMessage: null,
        expiresAtMs: now + ttlSeconds * 1000,
        createdAtMs: now,
        updatedAtMs: now,
      }
      this.backend.rows.set(row.id, row)
      return {
        action: 'create' as const,
        intentId: row.id,
        status: row.status,
        razorpayOrderId: null,
        expiresAt: new Date(row.expiresAtMs).toISOString(),
      }
    })
  }

  complete(input: {
    intentId: string
    ownerToken: string
    razorpayOrderId: string
    readyTtlSeconds?: number
  }) {
    const row = this.backend.rows.get(input.intentId)
    if (!row) return Promise.resolve({ ok: false, status: null, razorpayOrderId: null })
    return this.backend.withLock(row.milestoneId, () => {
      const current = this.backend.rows.get(input.intentId)
      if (!current || current.ownerToken !== input.ownerToken || current.status !== 'reserving') {
        return {
          ok: false,
          status: current?.status ?? null,
          razorpayOrderId: current?.razorpayOrderId ?? null,
        }
      }
      const now = this.backend.nowMs()
      const ttl = input.readyTtlSeconds ?? CSR_MILESTONE_INTENT_READY_TTL_SECONDS
      current.status = 'ready'
      current.razorpayOrderId = input.razorpayOrderId
      current.expiresAtMs = now + ttl * 1000
      current.updatedAtMs = now
      current.errorMessage = null
      return { ok: true, status: current.status, razorpayOrderId: current.razorpayOrderId }
    })
  }

  fail(input: { intentId: string; ownerToken: string; errorMessage?: string | null }) {
    const row = this.backend.rows.get(input.intentId)
    if (!row) return Promise.resolve({ ok: false, status: null })
    return this.backend.withLock(row.milestoneId, () => {
      const current = this.backend.rows.get(input.intentId)
      if (!current || current.ownerToken !== input.ownerToken || current.status !== 'reserving') {
        return { ok: false, status: current?.status ?? null }
      }
      current.status = 'failed'
      current.errorMessage = input.errorMessage ?? null
      current.updatedAtMs = this.backend.nowMs()
      return { ok: true, status: current.status }
    })
  }

  release(input: {
    milestoneId: string
    razorpayOrderId: string
  }): Promise<CsrMilestonePaymentIntentReleaseResult> {
    return this.backend.withLock(input.milestoneId, () => {
      const matches = [...this.backend.rows.values()]
        .filter(
          (row) =>
            row.milestoneId === input.milestoneId && row.razorpayOrderId === input.razorpayOrderId
        )
        .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
      const current = matches[0]
      if (!current) {
        return { ok: true, intentId: null, status: null, alreadyReleased: true }
      }
      if (current.status === 'released') {
        return {
          ok: true,
          intentId: current.id,
          status: current.status,
          alreadyReleased: true,
        }
      }
      if (current.status !== 'ready') {
        return {
          ok: false,
          intentId: current.id,
          status: current.status,
          alreadyReleased: false,
        }
      }
      current.status = 'released'
      current.errorMessage = null
      current.updatedAtMs = this.backend.nowMs()
      return {
        ok: true,
        intentId: current.id,
        status: current.status,
        alreadyReleased: false,
      }
    })
  }

  observe(milestoneId: string): Promise<CsrMilestonePaymentIntentObservation | null> {
    return this.backend.withLock(milestoneId, () => {
      this.backend.expireDue(milestoneId)
      const rows = [...this.backend.rows.values()]
        .filter(
          (row) =>
            row.milestoneId === milestoneId &&
            (row.status === 'reserving' || row.status === 'ready' || row.status === 'failed')
        )
        .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
      const row = rows[0]
      if (!row) return null
      return {
        intentId: row.id,
        status: row.status,
        razorpayOrderId: row.razorpayOrderId,
        pricingFingerprint: row.pricingFingerprint,
        expiresAt: new Date(row.expiresAtMs).toISOString(),
      }
    })
  }
}

/**
 * Best-effort release after payment settlement. Callers that need a default
 * Postgres store should use the wrapper in `csr-milestone-payment-intents.ts`.
 */
export async function releaseSettledCsrMilestonePaymentIntent(params: {
  milestoneId: string
  razorpayOrderId: string
  store: CsrMilestonePaymentIntentStore
}): Promise<CsrMilestonePaymentIntentReleaseResult | null> {
  try {
    return await params.store.release({
      milestoneId: params.milestoneId,
      razorpayOrderId: params.razorpayOrderId,
    })
  } catch (error) {
    if (isMissingPaymentIntentRpc(error)) return null
    console.error('Failed to release CSR milestone payment intent after settlement:', error)
    return null
  }
}

export async function waitForCsrMilestonePaymentIntent(params: {
  store: CsrMilestonePaymentIntentStore
  milestoneId: string
  pricingFingerprint: string
  timeoutMs?: number
  pollMs?: number
}): Promise<{ razorpayOrderId: string } | { failed: true; status: string }> {
  const timeoutMs = params.timeoutMs ?? 30_000
  const pollMs = params.pollMs ?? 50
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const observed = await params.store.observe(params.milestoneId)
    if (!observed) {
      await new Promise((resolve) => setTimeout(resolve, pollMs))
      continue
    }
    if (observed.status === 'ready' && observed.razorpayOrderId) {
      if (observed.pricingFingerprint && observed.pricingFingerprint !== params.pricingFingerprint) {
        return { failed: true, status: 'pricing_mismatch' }
      }
      return { razorpayOrderId: observed.razorpayOrderId }
    }
    if (observed.status === 'failed' || observed.status === 'expired') {
      return { failed: true, status: observed.status }
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs))
  }
  return { failed: true, status: 'timeout' }
}
