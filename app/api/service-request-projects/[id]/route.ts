import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { db } from '@/lib/db'
import { JWT_SECRET } from '@/lib/auth'

interface JWTPayload {
  id: number
  user_type: string
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload

    if (decoded.user_type !== 'ngo') {
      return NextResponse.json({ error: 'Only NGOs can update projects' }, { status: 403 })
    }

    const body = await request.json()
    const projectId = String(params.id)

    const existing = await db.requestProjects.getById(projectId)
    if (!existing) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (existing.ngo_id !== decoded.id) {
      return NextResponse.json({ error: 'Project ownership mismatch' }, { status: 403 })
    }

    const updates: any = {}
    if (body.title !== undefined) updates.title = String(body.title).trim() || undefined
    if (body.description !== undefined) updates.description = String(body.description).trim() || null
    if (body.exact_address !== undefined || body.location !== undefined) {
      const loc = String(body.exact_address || body.location || existing.exact_address || existing.location || '').trim()
      if (loc) {
        updates.location = loc
        updates.exact_address = loc
      }
    }
    if (body.timeline !== undefined) updates.timeline = String(body.timeline).trim() || null
    if (body.expected_beneficiaries !== undefined) updates.expected_beneficiaries = Number(body.expected_beneficiaries) || null
    if (body.valid_until !== undefined) {
      const validUntil = String(body.valid_until || '').trim()
      if (validUntil && Number.isNaN(new Date(validUntil).getTime())) {
        return NextResponse.json({ error: 'valid_until must be a valid date string' }, { status: 400 })
      }
      updates.valid_until = validUntil || null
    }
    if (body.csr_project_available_for_csr !== undefined) updates.csr_project_available_for_csr = !!body.csr_project_available_for_csr

    updates.updated_at = new Date().toISOString()

    await db.requestProjects.update(projectId, updates)

    const updated = await db.requestProjects.getById(projectId)

    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    console.error('Failed to update project:', error)
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 })
  }
}
