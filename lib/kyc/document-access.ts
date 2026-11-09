import 'server-only'
import { NextRequest } from 'next/server'
import { cloudinary } from '@/lib/cloudinary'
import { supabase } from '@/lib/db'
import {
  assertAdminUser,
  findAuthUser,
  getActiveCAFromRequest,
  getAdminUser,
  getAuthUserFromRequest,
} from '@/lib/server-auth'
import { hasLiveVerificationPack } from '@/lib/ca-review/pack-visibility'
import {
  ownerUserIdFromVerificationPublicId,
  parseKycDocumentRef,
  type KycDocumentRef,
} from '@/lib/kyc/document-refs'
import { parseJsonObject } from '@/lib/utils'

export type VerificationDocumentRow = {
  id: string
  user_id: number
  actor_type: string
  doc_key: string
  file_url: string | null
  metadata: unknown
  status: string | null
}

export async function loadVerificationDocumentById(
  documentId: string
): Promise<VerificationDocumentRow | null> {
  const { data, error } = await supabase
    .from('verification_documents')
    .select('id, user_id, actor_type, doc_key, file_url, metadata, status')
    .eq('id', documentId)
    .maybeSingle()

  if (error || !data) return null
  return data as VerificationDocumentRow
}

export function storageFromDocumentRow(row: VerificationDocumentRow): KycDocumentRef | null {
  const fromFile = parseKycDocumentRef(row.file_url)
  if (fromFile) return fromFile

  const meta = parseJsonObject(row.metadata)
  const publicId = String(meta.public_id || meta.publicId || '').trim()
  const resourceType = String(meta.resource_type || meta.resourceType || '').trim()
  const deliveryType = String(meta.delivery_type || meta.deliveryType || '').trim()
  if (
    !publicId ||
    (resourceType !== 'image' && resourceType !== 'raw' && resourceType !== 'video') ||
    (deliveryType !== 'authenticated' && deliveryType !== 'upload')
  ) {
    return null
  }
  return {
    publicId,
    resourceType,
    deliveryType,
    documentId: row.id,
  }
}

/**
 * Platform CA may access documents for owners with a live verification pack
 * (pending/verified), matching CA review document visibility. There is no
 * finer-grained case-assignment table in-app.
 */
async function platformCaMayAccessOwnerDocuments(ownerUserId: number): Promise<boolean> {
  const { data, error } = await supabase
    .from('users')
    .select('verification_status')
    .eq('id', ownerUserId)
    .maybeSingle()
  if (error || !data) return false
  return hasLiveVerificationPack(data.verification_status)
}

export type DocumentAccessActor =
  | { kind: 'owner'; userId: number }
  | { kind: 'platform_ca'; caId: number }
  | { kind: 'admin'; userId: number }

export async function resolveDocumentAccessActor(
  request: NextRequest
): Promise<DocumentAccessActor | null> {
  try {
    const ca = await getActiveCAFromRequest(request)
    if (ca) return { kind: 'platform_ca', caId: Number(ca.id) }
  } catch {
    // Not a platform CA session — fall through to user/admin.
  }

  try {
    if (getAdminUser(request)) {
      const admin = assertAdminUser(request)
      return { kind: 'admin', userId: admin.id }
    }
  } catch {
    // Not admin.
  }

  if (findAuthUser(request)) {
    const user = await getAuthUserFromRequest(request)
    return { kind: 'owner', userId: user.id }
  }
  return null
}

export async function assertCanAccessVerificationDocument(
  request: NextRequest,
  row: VerificationDocumentRow
): Promise<{ ok: true; actor: DocumentAccessActor } | { ok: false; status: 401 | 403 }> {
  const actor = await resolveDocumentAccessActor(request)
  if (!actor) return { ok: false, status: 401 }

  if (actor.kind === 'owner') {
    if (actor.userId !== row.user_id) return { ok: false, status: 403 }
    return { ok: true, actor }
  }

  if (actor.kind === 'admin') {
    return { ok: true, actor }
  }

  // platform_ca
  const allowed = await platformCaMayAccessOwnerDocuments(row.user_id)
  if (!allowed) return { ok: false, status: 403 }
  return { ok: true, actor }
}

export function assertPublicIdOwnedBy(publicId: string, userId: number): boolean {
  return ownerUserIdFromVerificationPublicId(publicId) === userId
}

export async function downloadKycAssetBytes(ref: KycDocumentRef): Promise<{
  buffer: Buffer
  contentType: string
}> {
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    throw new Error('Verification document service is not configured')
  }

  let downloadUrl: string
  if (ref.deliveryType === 'authenticated') {
    downloadUrl = cloudinary.url(ref.publicId, {
      type: 'authenticated',
      resource_type: ref.resourceType,
      sign_url: true,
      secure: true,
    })
  } else {
    // Legacy public upload assets — still fetched server-side after authZ only.
    downloadUrl = cloudinary.url(ref.publicId, {
      type: 'upload',
      resource_type: ref.resourceType,
      secure: true,
    })
  }

  const response = await fetch(downloadUrl, {
    signal: AbortSignal.timeout(20000),
    redirect: 'error',
  })
  if (!response.ok) {
    throw new Error(`Failed to retrieve verification document (${response.status})`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  const headerType = response.headers.get('content-type') || ''
  const contentType =
    headerType && !headerType.includes('text/html')
      ? headerType
      : guessContentType(ref.publicId, ref.resourceType)

  return { buffer, contentType }
}

function guessContentType(publicId: string, resourceType: string): string {
  const lower = publicId.toLowerCase()
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (resourceType === 'image') return 'image/jpeg'
  return 'application/octet-stream'
}
