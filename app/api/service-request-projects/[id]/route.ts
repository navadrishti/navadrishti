import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { db } from '@/lib/db'
import { JWT_SECRET, CSR_OWN_PROJECT_TIMELINE_MESSAGE, CSR_PROJECT_CREATE_REQUIRED_MESSAGE } from '@/lib/auth'
import { ngoUserIsCsrEligible, ngoUserIsCsrEligibleForProject } from '@/lib/server-auth'
import {
  formatProjectExactAddress,
  parseProjectExactAddress,
  projectAddressToLocationSummary,
  serializeProjectExactAddress,
  validateProjectExactAddress,
  mergeClientProjectDescription,
  stripProjectMetaFromDescription,
} from '@/lib/service-request-allocation'

interface JWTPayload {
  id: number
  user_type: string
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params
    const body = await request.json()
    const projectId = String(id)

    const existing = await db.requestProjects.getById(projectId)
    if (!existing) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (existing.ngo_id !== decoded.id) {
      return NextResponse.json({ error: 'Project ownership mismatch' }, { status: 403 })
    }

    if (!(await ngoUserIsCsrEligible(decoded.id))) {
      return NextResponse.json({ error: CSR_PROJECT_CREATE_REQUIRED_MESSAGE }, { status: 403 })
    }

    const updates: any = {}
    if (body.title !== undefined) updates.title = String(body.title).trim() || undefined
    if (body.description !== undefined) {
      updates.description = mergeClientProjectDescription(
        existing.description,
        String(body.description).trim() || null,
        {
          contact_info:
            body.contact_info !== undefined
              ? (String(body.contact_info || '').trim() || null)
              : undefined,
          impact_description:
            body.impact_description !== undefined
              ? (String(body.impact_description || '').trim() || null)
              : undefined,
          category:
            body.category !== undefined
              ? (String(body.category || '').trim() || null)
              : undefined,
          budget_inr:
            body.budget_inr !== undefined
              ? (Number(body.budget_inr) || null)
              : undefined,
        }
      )
    } else if (
      body.contact_info !== undefined ||
      body.impact_description !== undefined ||
      body.category !== undefined ||
      body.budget_inr !== undefined
    ) {
      updates.description = mergeClientProjectDescription(
        existing.description,
        stripProjectMetaFromDescription(existing.description),
        {
          contact_info:
            body.contact_info !== undefined
              ? (String(body.contact_info || '').trim() || null)
              : undefined,
          impact_description:
            body.impact_description !== undefined
              ? (String(body.impact_description || '').trim() || null)
              : undefined,
          category:
            body.category !== undefined
              ? (String(body.category || '').trim() || null)
              : undefined,
          budget_inr:
            body.budget_inr !== undefined
              ? (Number(body.budget_inr) || null)
              : undefined,
        }
      )
    }
    if (body.address !== undefined || body.exact_address !== undefined || body.location !== undefined) {
      const addressInput =
        body.address && typeof body.address === 'object'
          ? body.address
          : body.exact_address ?? body.location ?? existing.exact_address ?? existing.location

      const parsedAddress = parseProjectExactAddress(addressInput)
      const addressError = validateProjectExactAddress(parsedAddress)
      if (addressError) {
        return NextResponse.json({ error: addressError }, { status: 400 })
      }

      const serializedAddress = serializeProjectExactAddress(parsedAddress)
      updates.exact_address = serializedAddress
      updates.location = projectAddressToLocationSummary(parsedAddress)
    }
    if (body.timeline !== undefined) updates.timeline = String(body.timeline).trim() || null
    if (body.expected_beneficiaries !== undefined) {
      updates.expected_beneficiaries = Number(body.expected_beneficiaries) || null
    }
    if (body.valid_until !== undefined) {
      const validUntil = String(body.valid_until || '').trim()
      if (validUntil && Number.isNaN(new Date(validUntil).getTime())) {
        return NextResponse.json({ error: 'valid_until must be a valid date string' }, { status: 400 })
      }
      updates.valid_until = validUntil ? new Date(validUntil).toISOString() : null
    }

    const coverageProject = {
      valid_until:
        updates.valid_until !== undefined ? updates.valid_until : existing.valid_until,
      timeline: updates.timeline !== undefined ? updates.timeline : existing.timeline,
    }
    if (!(await ngoUserIsCsrEligibleForProject(decoded.id, coverageProject))) {
      return NextResponse.json({ error: CSR_OWN_PROJECT_TIMELINE_MESSAGE }, { status: 403 })
    }

    // Edits require live CSR-1 coverage, so keep the project open for CSR marketplace.
    updates.csr_project_available_for_csr = true
    updates.updated_at = new Date().toISOString()

    await db.requestProjects.update(projectId, updates)

    const updated = await db.requestProjects.getById(projectId)

    return NextResponse.json({
      success: true,
      data: {
        ...updated,
        address: parseProjectExactAddress(updated?.exact_address || updated?.location),
        formatted_address: formatProjectExactAddress(updated?.exact_address || updated?.location),
      },
    })
  } catch (error) {
    console.error('Failed to update project:', error)
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload

    if (decoded.user_type !== 'ngo') {
      return NextResponse.json({ error: 'Only NGOs can delete projects' }, { status: 403 })
    }

    const { id } = await params
    const projectId = String(id)
    const existing = await db.requestProjects.getById(projectId)
    if (!existing) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (Number(existing.ngo_id) !== Number(decoded.id)) {
      return NextResponse.json({ error: 'Project ownership mismatch' }, { status: 403 })
    }

    if (
      Number(existing.assigned_company_user_id || 0) > 0 &&
      String(existing.assignment_status || '').toLowerCase() === 'accepted'
    ) {
      return NextResponse.json(
        { error: 'This project has an accepted company assignment and cannot be deleted.' },
        { status: 409 }
      )
    }

    await db.requestProjects.delete(projectId)
    return NextResponse.json({ success: true, message: 'Project deleted successfully' })
  } catch (error) {
    console.error('Failed to delete project:', error)
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 })
  }
}
