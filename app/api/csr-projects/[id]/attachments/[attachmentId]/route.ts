import { NextRequest, NextResponse } from 'next/server'
import { cloudinary } from '@/lib/cloudinary'
import { canViewProjectOps, loadCsrProject, resolveProjectOpsActor } from '@/lib/csr-agent/project-ops-access'
import { authErrorResponse } from '@/lib/server-auth'

export const runtime = 'nodejs'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  try {
    const actor = await resolveProjectOpsActor(request)
    if (!actor) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    const { id, attachmentId } = await params
    const project = await loadCsrProject(id)
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    if (!canViewProjectOps(actor, project)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(attachmentId)) {
      return NextResponse.json({ error: 'Invalid attachment' }, { status: 400 })
    }
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      return NextResponse.json({ error: 'Image service is not configured' }, { status: 503 })
    }
    const url = cloudinary.url(`csr-project-attachments/${id}/${attachmentId}`, {
      type: 'authenticated', resource_type: 'image', sign_url: true, secure: true,
    })
    const response = await fetch(url, { signal: AbortSignal.timeout(20000), redirect: 'error' })
    if (!response.ok) throw new Error(`Image retrieval failed (${response.status})`)
    const contentType = response.headers.get('content-type') || ''
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(contentType.split(';')[0].trim())) {
      throw new Error('Image service returned an invalid content type')
    }
    return new NextResponse(await response.arrayBuffer(), {
      headers: { 'Content-Type': contentType, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
    })
  } catch (error) {
    const auth = authErrorResponse(error)
    if (auth) return auth
    console.error('[csr-projects/attachments GET]', error)
    return NextResponse.json({ error: 'Failed to retrieve image' }, { status: 500 })
  }
}
