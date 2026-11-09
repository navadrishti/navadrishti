import { NextRequest, NextResponse } from 'next/server'
import { kycContentProxyEnabled } from '@/lib/kyc/flags'
import {
  assertCanAccessVerificationDocument,
  downloadKycAssetBytes,
  loadVerificationDocumentById,
  storageFromDocumentRow,
} from '@/lib/kyc/document-access'
import { isTrustedDocumentUrl } from '@/lib/ca-review/document-urls'
import { parseKycDocumentRef } from '@/lib/kyc/document-refs'
import { authErrorResponse } from '@/lib/server-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * Streams KYC document bytes after server-side authorization.
 * Never accepts a client-supplied Cloudinary URL.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    if (!kycContentProxyEnabled()) {
      return NextResponse.json({ error: 'Document content proxy is not enabled' }, { status: 503 })
    }

    const { id: documentId } = await context.params
    if (!documentId || !/^[0-9a-f-]{36}$/i.test(documentId)) {
      return NextResponse.json({ error: 'Invalid document id' }, { status: 400 })
    }

    // Reject attempts to pass Cloudinary URLs through query params.
    const injectedUrl = request.nextUrl.searchParams.get('url')
    if (injectedUrl) {
      return NextResponse.json({ error: 'Arbitrary document URLs are not accepted' }, { status: 400 })
    }

    const row = await loadVerificationDocumentById(documentId)
    if (!row) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const access = await assertCanAccessVerificationDocument(request, row)
    if (!access.ok) {
      return NextResponse.json(
        { error: access.status === 401 ? 'Authentication required' : 'Insufficient permissions' },
        { status: access.status }
      )
    }

    let storage = storageFromDocumentRow(row)

    // Legacy rows: public Cloudinary URL in file_url without structured metadata.
    if (!storage && row.file_url && isTrustedDocumentUrl(row.file_url) && !parseKycDocumentRef(row.file_url)) {
      const publicId = publicIdFromLegacyCloudinaryUrl(row.file_url)
      const resourceType = resourceTypeFromLegacyCloudinaryUrl(row.file_url)
      if (publicId && resourceType) {
        storage = {
          documentId: row.id,
          publicId,
          resourceType,
          deliveryType: 'upload',
        }
      }
    }

    if (!storage) {
      return NextResponse.json({ error: 'Document storage reference is invalid' }, { status: 404 })
    }

    const { buffer, contentType } = await downloadKycAssetBytes(storage)
    const fileName = storage.publicId.split('/').pop() || 'document'
    const body = new Uint8Array(buffer)

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(body.byteLength),
        'Content-Disposition': `inline; filename="${fileName.replace(/"/g, '')}"`,
        'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
        Pragma: 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    const auth = authErrorResponse(error)
    if (auth) return auth
    console.error('Verification document content error:', error instanceof Error ? error.name : 'error')
    return NextResponse.json({ error: 'Failed to retrieve verification document' }, { status: 500 })
  }
}

function publicIdFromLegacyCloudinaryUrl(url: string): string | null {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean)
    // /<cloud>/<resource>/<delivery>/[v123/]<public_id...>
    if (parts.length < 4) return null
    const rest = parts.slice(3)
    const withoutVersion = /^v\d+$/.test(rest[0]) ? rest.slice(1) : rest
    return withoutVersion.length ? withoutVersion.join('/') : null
  } catch {
    return null
  }
}

function resourceTypeFromLegacyCloudinaryUrl(url: string): 'image' | 'raw' | 'video' | null {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean)
    const resourceType = parts[1]
    if (resourceType === 'image' || resourceType === 'raw' || resourceType === 'video') return resourceType
    return null
  } catch {
    return null
  }
}
