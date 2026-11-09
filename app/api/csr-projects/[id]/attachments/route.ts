import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { cloudinary } from '@/lib/cloudinary'
import { canSubmitProjectOps, loadCsrProject, resolveProjectOpsActor } from '@/lib/csr-agent/project-ops-access'
import { authErrorResponse } from '@/lib/server-auth'

export const runtime = 'nodejs'
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await resolveProjectOpsActor(request, { preferUserSession: true })
    if (!actor) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    const { id } = await params
    const project = await loadCsrProject(id)
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    if (!canSubmitProjectOps(actor, project)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      return NextResponse.json({ error: 'Image upload service is not configured' }, { status: 503 })
    }
    const file = (await request.formData()).get('file')
    if (!(file instanceof File) || !allowedTypes.has(file.type)) {
      return NextResponse.json({ error: 'Choose a JPG, PNG, GIF or WebP image' }, { status: 400 })
    }
    if (!file.size || file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Image must be non-empty and no larger than 10 MB' }, { status: 400 })
    }
    const attachmentId = randomUUID()
    const buffer = Buffer.from(await file.arrayBuffer())
    await new Promise<void>((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { resource_type: 'image', type: 'authenticated', public_id: `csr-project-attachments/${id}/${attachmentId}`, overwrite: false },
        (error, result) => {
          if (error || !result) return reject(error ?? new Error('Image upload returned no result'))
          if (result.public_id !== `csr-project-attachments/${id}/${attachmentId}` || result.type !== 'authenticated') {
            return reject(new Error('Image upload did not return the expected authenticated asset'))
          }
          resolve()
        }
      ).end(buffer)
    })
    return NextResponse.json({ success: true, url: `/api/csr-projects/${id}/attachments/${attachmentId}` })
  } catch (error) {
    const auth = authErrorResponse(error)
    if (auth) return auth
    console.error('[csr-projects/attachments POST]', error)
    return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 })
  }
}
