/**
 * Delhivery freight extraction from provider payloads.
 *
 * Integrated endpoints today:
 * - POST /api/cmu/create.json — waybill/status; documented packages[] have no freight money fields
 * - GET /api/v1/packages/json/?waybill= — tracking; exposes ChargedWeight, CODAmount, InvoiceAmount
 *   (package/COD value and billed weight — NOT shipping freight)
 *
 * Approximate rate card (NOT integrated, NOT confirmed freight):
 * - GET /api/kinko/v1/invoice/charges/.json → total_amount / gross_amount are vendor-documented as
 *   approximate quotes; actual invoiced freight can differ and is delivered via Delhivery panel/email.
 *
 * This module never treats package declared value (`total_amount` on create) as freight.
 */

import { parseJsonObject } from '@/lib/utils'
import type { CsrCapabilityDeliveryLeg } from '@/lib/service-engagement'

/** Keys that mean shipping freight when present with a positive amount. */
export const DELHIVERY_CONFIRMED_FREIGHT_KEYS = [
  'FreightCharge',
  'freight_charge',
  'freight_amount',
  'ChargedFreight',
  'shipping_charge',
  'ShippingCharge',
  'Freight',
  'freight',
] as const

/** Approximate rate-card / quote keys (never promote to confirmed). */
export const DELHIVERY_QUOTE_FREIGHT_KEYS = [
  'quoted_freight_inr',
  'estimated_freight_inr',
  'freight_quote_inr',
  'gross_amount', // kinko rate response
] as const

/** Explicitly never freight money. */
export const DELHIVERY_NON_FREIGHT_AMOUNT_KEYS = new Set([
  'total_amount', // create request/response package declared value OR kinko quote total (ambiguous)
  'TotalAmount',
  'InvoiceAmount',
  'invoice_amount',
  'CODAmount',
  'cod_amount',
  'ChargedWeight', // weight (kg/g), not INR
  'charged_weight',
  'Weight',
])

export type DelhiveryFreightCapture = {
  confirmed_freight_inr: number | null
  quoted_freight_inr: number | null
  confirmed_source: string | null
  quoted_source: string | null
  charged_weight: number | null
  /** True when only non-freight money fields were seen (invoice/COD/package value). */
  saw_non_freight_amounts: boolean
  /** Provider payload slice kept for audit (booking package or shipment object). */
  evidence: Record<string, unknown> | null
}

function money(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? Number(n.toFixed(2)) : NaN
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function firstPositive(source: Record<string, unknown>, keys: readonly string[]): { amount: number; key: string } | null {
  for (const key of keys) {
    if (!(key in source)) continue
    if (DELHIVERY_NON_FREIGHT_AMOUNT_KEYS.has(key)) continue
    const amount = money(source[key])
    if (amount > 0) return { amount, key }
  }
  return null
}

function collectCandidateObjects(raw: unknown): Array<{ label: string; obj: Record<string, unknown> }> {
  const root = parseJsonObject(raw)
  const out: Array<{ label: string; obj: Record<string, unknown> }> = []
  if (Object.keys(root).length) out.push({ label: 'root', obj: root })

  const packages = root.packages
  if (Array.isArray(packages) && packages[0]) {
    out.push({ label: 'packages[0]', obj: asRecord(packages[0]) })
  }

  const shipmentData = root.ShipmentData
  if (Array.isArray(shipmentData) && shipmentData[0]) {
    const wrapper = asRecord(shipmentData[0])
    out.push({ label: 'ShipmentData[0]', obj: wrapper })
    const shipment = asRecord(wrapper.Shipment)
    if (Object.keys(shipment).length) out.push({ label: 'ShipmentData[0].Shipment', obj: shipment })
  }

  const shipment = asRecord(root.Shipment || root.shipment)
  if (Object.keys(shipment).length) out.push({ label: 'Shipment', obj: shipment })

  return out
}

/**
 * Extract freight candidates from a Delhivery create or tracking payload.
 * Confirmed amounts require freight-named keys; package/COD/invoice values are ignored.
 */
export function extractDelhiveryFreightFromProviderPayload(raw: unknown): DelhiveryFreightCapture {
  const empty: DelhiveryFreightCapture = {
    confirmed_freight_inr: null,
    quoted_freight_inr: null,
    confirmed_source: null,
    quoted_source: null,
    charged_weight: null,
    saw_non_freight_amounts: false,
    evidence: null,
  }
  if (raw == null) return empty

  let confirmed: DelhiveryFreightCapture['confirmed_freight_inr'] = null
  let confirmed_source: string | null = null
  let quoted: DelhiveryFreightCapture['quoted_freight_inr'] = null
  let quoted_source: string | null = null
  let charged_weight: number | null = null
  let saw_non_freight_amounts = false
  let evidence: Record<string, unknown> | null = null

  for (const { label, obj } of collectCandidateObjects(raw)) {
    for (const key of DELHIVERY_NON_FREIGHT_AMOUNT_KEYS) {
      if (key in obj && money(obj[key]) > 0) saw_non_freight_amounts = true
    }

    const weight = money(obj.ChargedWeight ?? obj.charged_weight)
    if (Number.isFinite(weight) && weight > 0 && charged_weight == null) {
      charged_weight = weight
    }

    if (confirmed == null) {
      const hit = firstPositive(obj, DELHIVERY_CONFIRMED_FREIGHT_KEYS)
      if (hit) {
        confirmed = hit.amount
        confirmed_source = `${label}.${hit.key}`
        evidence = {
          source_path: confirmed_source,
          [hit.key]: hit.amount,
          waybill: obj.waybill ?? obj.Waybill ?? obj.AWB ?? null,
        }
      }
    }

    // Quotes only when explicitly named — never promote total_amount from create/tracking.
    if (quoted == null) {
      const hit = firstPositive(obj, DELHIVERY_QUOTE_FREIGHT_KEYS)
      if (hit) {
        quoted = hit.amount
        quoted_source = `${label}.${hit.key}`
      }
    }
  }

  return {
    confirmed_freight_inr: confirmed,
    quoted_freight_inr: quoted,
    confirmed_source,
    quoted_source,
    charged_weight,
    saw_non_freight_amounts,
    evidence,
  }
}

/**
 * Parse an approximate Delhivery rate-card (kinko) response as a quote only.
 * Never returns confirmed freight — vendor documents these amounts as approximate.
 */
export function extractDelhiveryQuotedFreightFromRateResponse(raw: unknown): {
  quoted_freight_inr: number | null
  source: string | null
} {
  const rows = Array.isArray(raw) ? raw : Array.isArray(parseJsonObject(raw).charges) ? (parseJsonObject(raw).charges as unknown[]) : [raw]
  const first = asRecord(rows[0])
  // Prefer gross_amount; total_amount on this endpoint is quote+tax approx — still a quote.
  const gross = money(first.gross_amount)
  if (gross > 0) return { quoted_freight_inr: gross, source: 'kinko.gross_amount' }
  const total = money(first.total_amount)
  if (total > 0) return { quoted_freight_inr: total, source: 'kinko.total_amount_approx' }
  return { quoted_freight_inr: null, source: null }
}

/**
 * Merge capture into a delivery leg without overwriting a confirmed amount with a quote.
 * Preserves prior confirmed freight and refund accounting fields.
 */
export function mergeDelhiveryFreightCaptureIntoLeg(
  existing: CsrCapabilityDeliveryLeg | null | undefined,
  capture: DelhiveryFreightCapture,
  input?: { bookingRaw?: unknown; trackingRaw?: unknown }
): CsrCapabilityDeliveryLeg {
  const prior = { ...(existing || {}) } as CsrCapabilityDeliveryLeg
  const priorConfirmed =
    prior.confirmed_freight_inr != null && Number(prior.confirmed_freight_inr) > 0
      ? Number(prior.confirmed_freight_inr)
      : null

  const next: CsrCapabilityDeliveryLeg = { ...prior }

  if (capture.confirmed_freight_inr != null && capture.confirmed_freight_inr > 0) {
    // Allow update when provider reports a new confirmed amount; never clear an existing confirmed
    // value when this capture has none.
    next.confirmed_freight_inr = capture.confirmed_freight_inr
    next.provider_charges = {
      confirmed: true,
      amount_inr: capture.confirmed_freight_inr,
      freight_inr: capture.confirmed_freight_inr,
    }
  } else if (priorConfirmed != null) {
    next.confirmed_freight_inr = priorConfirmed
    next.provider_charges = {
      confirmed: true,
      amount_inr: priorConfirmed,
      freight_inr: priorConfirmed,
    }
  }

  if (capture.quoted_freight_inr != null && capture.quoted_freight_inr > 0) {
    // Never overwrite confirmed with quote; still record quote for visibility.
    if (next.confirmed_freight_inr == null || prior.quoted_freight_inr == null) {
      next.quoted_freight_inr = capture.quoted_freight_inr
    }
  }

  next.freight_capture = {
    confirmed_source: capture.confirmed_source,
    quoted_source: capture.quoted_source,
    charged_weight: capture.charged_weight,
    saw_non_freight_amounts: capture.saw_non_freight_amounts,
    evidence: capture.evidence,
    captured_at: new Date().toISOString(),
  }

  if (input?.bookingRaw != null) {
    next.provider_booking_raw = summarizeProviderRaw(input.bookingRaw)
  }
  if (capture.evidence) {
    next.provider_tracking_freight_evidence = capture.evidence
  }

  return next
}

function summarizeProviderRaw(raw: unknown): Record<string, unknown> {
  const root = parseJsonObject(raw)
  const packages = Array.isArray(root.packages) ? root.packages[0] : null
  const pkg = asRecord(packages)
  return {
    success: root.success ?? null,
    waybill: pkg.waybill ?? pkg.Waybill ?? root.waybill ?? null,
    status: pkg.status ?? root.status ?? null,
    remarks: pkg.remarks ?? root.rmk ?? null,
    // Explicitly note absence/presence of freight-named keys without storing package value as freight.
    freight_keys_present: DELHIVERY_CONFIRMED_FREIGHT_KEYS.filter((k) => k in pkg || k in root),
    non_freight_amount_keys_present: [...DELHIVERY_NON_FREIGHT_AMOUNT_KEYS].filter((k) => k in pkg || k in root),
  }
}

/**
 * Capture freight from booking and/or tracking payloads and merge onto a leg.
 */
export function captureDelhiveryFreightForLeg(input: {
  existingLeg?: CsrCapabilityDeliveryLeg | null
  bookingRaw?: unknown
  trackingRaw?: unknown
}): { leg: CsrCapabilityDeliveryLeg; capture: DelhiveryFreightCapture } {
  const fromBooking = extractDelhiveryFreightFromProviderPayload(input.bookingRaw)
  const fromTracking = extractDelhiveryFreightFromProviderPayload(input.trackingRaw)

  const mergedCapture: DelhiveryFreightCapture = {
    confirmed_freight_inr: fromTracking.confirmed_freight_inr ?? fromBooking.confirmed_freight_inr,
    quoted_freight_inr: fromTracking.quoted_freight_inr ?? fromBooking.quoted_freight_inr,
    confirmed_source: fromTracking.confirmed_source ?? fromBooking.confirmed_source,
    quoted_source: fromTracking.quoted_source ?? fromBooking.quoted_source,
    charged_weight: fromTracking.charged_weight ?? fromBooking.charged_weight,
    saw_non_freight_amounts: fromTracking.saw_non_freight_amounts || fromBooking.saw_non_freight_amounts,
    evidence: fromTracking.evidence ?? fromBooking.evidence,
  }

  return {
    capture: mergedCapture,
    leg: mergeDelhiveryFreightCaptureIntoLeg(input.existingLeg, mergedCapture, {
      bookingRaw: input.bookingRaw,
      trackingRaw: input.trackingRaw,
    }),
  }
}
