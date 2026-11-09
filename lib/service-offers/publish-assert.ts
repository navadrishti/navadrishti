import { supabase } from '@/lib/db'
import { resolveEffectiveVerificationStatus } from '@/lib/server-auth'
import {
  assertUserRazorpayPayoutActiveForCapabilities,
  CAPABILITY_LISTING_REQUIRES_PAYOUT_MESSAGE,
} from '@/lib/razorpay-route'
import { parseJsonObject } from '@/lib/utils'
import {
  CAPABILITY_NGO_LEGAL_ENTITY_REQUIRED_MESSAGE,
  ngoHasLegalEntityTag,
} from './legal-tags'

export type CapabilityPublishGateFailure = {
  ok: false
  status: 403 | 404
  error: string
  requiresVerification?: true
  requiresPayoutConnection?: true
  requiresLegalTags?: true
}

export type CapabilityPublishGateSuccess = { ok: true }

export async function assertCapabilityPublisher(
  userId: number,
  userType: string
): Promise<CapabilityPublishGateSuccess | CapabilityPublishGateFailure> {
  if (!['ngo', 'company', 'individual'].includes(String(userType || ''))) {
    return {
      ok: false,
      status: 403,
      error: 'Only verified NGO, company, or individual accounts can create capability offers.',
    }
  }

  const effectiveVerificationStatus = await resolveEffectiveVerificationStatus(userId, userType)
  if (effectiveVerificationStatus !== 'verified') {
    return {
      ok: false,
      status: 403,
      error: 'You need to complete verification before creating capability offers.',
      requiresVerification: true,
    }
  }

  try {
    await assertUserRazorpayPayoutActiveForCapabilities(userId)
  } catch (payoutError) {
    return {
      ok: false,
      status: 403,
      error: payoutError instanceof Error ? payoutError.message : CAPABILITY_LISTING_REQUIRES_PAYOUT_MESSAGE,
      requiresPayoutConnection: true,
    }
  }

  if (userType === 'ngo') {
    const [{ data: userRow }, { data: ngoVerification }] = await Promise.all([
      supabase.from('users').select('profile_data').eq('id', userId).maybeSingle(),
      supabase.from('ngo_verifications').select('registration_type').eq('user_id', userId).maybeSingle(),
    ])
    if (
      !ngoHasLegalEntityTag({
        profile_data: parseJsonObject(userRow?.profile_data),
        registration_type: ngoVerification?.registration_type,
      })
    ) {
      return {
        ok: false,
        status: 403,
        error: CAPABILITY_NGO_LEGAL_ENTITY_REQUIRED_MESSAGE,
        requiresLegalTags: true,
      }
    }
  }

  return { ok: true }
}

export function capabilityPublishGateResponse(gate: CapabilityPublishGateFailure) {
  return {
    error: gate.error,
    ...(gate.requiresVerification ? { requiresVerification: true } : {}),
    ...(gate.requiresPayoutConnection ? { requiresPayoutConnection: true } : {}),
    ...(gate.requiresLegalTags ? { requiresLegalTags: true } : {}),
  }
}
