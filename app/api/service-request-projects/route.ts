import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { db, supabase } from '@/lib/db';
import {
  JWT_SECRET,
  CSR_OWN_PROJECT_TIMELINE_MESSAGE,
  CSR_PROJECT_CREATE_REQUIRED_MESSAGE,
} from '@/lib/auth';

import { ngoUserIsCsrEligible, ngoUserIsCsrEligibleForProject } from '@/lib/server-auth';
import {
  withProjectMeta,
  enrichProjectRecord,
  redactProjectSensitiveFields,
  stripProjectMetaFromDescription,
  formatProjectExactAddress,
  parseProjectExactAddress,
  projectAddressToLocationSummary,
  serializeProjectExactAddress,
  validateProjectExactAddress,
} from '@/lib/service-request-allocation';

interface JWTPayload {
  id: number;
  user_type: string;
  email: string;
  name: string;
  verification_status?: string;
}

async function withNgoListingFields(projects: any[]) {
  const enriched = projects.map((project) => enrichProjectRecord(project))
  const ngoIds = Array.from(
    new Set(enriched.map((project: any) => Number(project?.ngo_id)).filter((id) => Number.isFinite(id) && id > 0))
  )
  if (ngoIds.length === 0) {
    return enriched.map((project) => redactProjectSensitiveFields(project))
  }

  const { data: ngos, error } = await supabase
    .from('users')
    .select('id, name, verification_status, city, state_province, location')
    .in('id', ngoIds)

  if (error) {
    console.error('Failed to load NGO details for projects listing:', error)
    return enriched.map((project) => redactProjectSensitiveFields(project))
  }

  const ngoById = new Map((ngos || []).map((ngo: any) => [Number(ngo.id), ngo]))
  return enriched.map((project: any) => {
    const ngo = ngoById.get(Number(project.ngo_id))
    return redactProjectSensitiveFields({
      ...project,
      ngo_name: ngo?.name || project.ngo_name || 'NGO',
      ngo_verified: String(ngo?.verification_status || '').toLowerCase() === 'verified',
      ngo_location:
        ngo?.city && ngo?.state_province
          ? `${ngo.city}, ${ngo.state_province}`
          : ngo?.location || null,
      formatted_address: formatProjectExactAddress(project.exact_address || project.location),
      location_summary:
        projectAddressToLocationSummary(parseProjectExactAddress(project.exact_address || project.location)) ||
        project.location ||
        null,
    })
  })
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ngoId = searchParams.get('ngoId');
    const status = searchParams.get('status');
    const includeEmpty = searchParams.get('includeEmpty') !== 'false';
    const q = String(searchParams.get('q') || '').trim();

    const projects = await db.requestProjects.getAll({
      ngo_id: ngoId ? Number(ngoId) : undefined,
      status: status || undefined,
      q: q || undefined,
    });

    // Default: return all matching projects (projects are CSR packages, not need parents).
    // Pass includeEmpty=false only when callers want projects that still have linked needs.
    if (!includeEmpty) {
      const projectIds = projects.map((project: any) => project.id).filter(Boolean);
      if (projectIds.length === 0) {
        return NextResponse.json({ success: true, data: [] });
      }

      const { data: ongoingNeeds, error: needsError } = await supabase
        .from('service_requests')
        .select('project_id, status')
        .in('project_id', projectIds)
        .not('status', 'in', '(completed,cancelled)');

      if (needsError) {
        throw needsError;
      }

      const validProjectIds = new Set(
        (ongoingNeeds || []).map((need: any) => need.project_id).filter(Boolean)
      );

      const filteredProjects = projects.filter((project: any) => validProjectIds.has(project.id));
      const nonDemo = filteredProjects.filter((p: any) => {
        const title = String(p.title || '').toLowerCase()
        return !title.includes('demo') && !title.includes('sample')
      })

      return NextResponse.json({ success: true, data: await withNgoListingFields(nonDemo) });
    }

    const nonDemo = projects.filter((p: any) => {
      const title = String(p.title || '').toLowerCase()
      return !title.includes('demo') && !title.includes('sample')
    })

    if (!q) {
      return NextResponse.json({ success: true, data: await withNgoListingFields(nonDemo) });
    }

    const tokens = q.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).filter((t) => t.length > 2)

    const scored = nonDemo.map((p: any) => {
      let score = 0
      const hay = `${p.title || ''} ${p.description || ''} ${p.location || ''} ${p.timeline || ''}`.toLowerCase()
      for (const t of tokens) {
        if (hay.includes(t)) score += 8
      }
      for (const t of tokens) {
        if ((p.location || '').toLowerCase().includes(t)) score += 12
      }
      if (p.created_at) {
        const ageDays = (Date.now() - new Date(p.created_at).getTime()) / (1000 * 60 * 60 * 24)
        if (ageDays < 30) score += 6
        else if (ageDays < 90) score += 3
      }
      return { project: p, score }
    }).sort((a: any, b: any) => b.score - a.score)

    return NextResponse.json({
      success: true,
      data: await withNgoListingFields(scored.map((s: any) => s.project)),
    });
  } catch (error) {
    console.error('Failed to fetch service request projects:', error);
    return NextResponse.json({ error: 'Failed to fetch service request projects' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;

    if (decoded.user_type !== 'ngo') {
      return NextResponse.json({ error: 'Only NGOs can create service request projects' }, { status: 403 });
    }

    const body = await request.json();
    const title = String(body.title || '').trim();
    const description = stripProjectMetaFromDescription(String(body.description || '').trim());
    const addressInput = body.address && typeof body.address === 'object'
      ? body.address
      : body.exact_address || body.location || '';
    const parsedAddress = parseProjectExactAddress(addressInput);
    const addressError = validateProjectExactAddress(parsedAddress);
    if (addressError) {
      return NextResponse.json({ error: addressError }, { status: 400 });
    }
    const serializedAddress = serializeProjectExactAddress(parsedAddress);
    const locationSummary = projectAddressToLocationSummary(parsedAddress);
    const timeline = String(body.timeline || '').trim();

    if (!title) {
      return NextResponse.json({ error: 'Project title is required' }, { status: 400 });
    }

    const volunteersNeeded = Number(body.volunteers_needed) || null;
    const expectedBeneficiaries = body.expected_beneficiaries != null ? (Number(body.expected_beneficiaries) || null) : null;
    const validUntil = body.valid_until ? String(body.valid_until).trim() : null;

    if (!volunteersNeeded || volunteersNeeded <= 0) {
      return NextResponse.json({ error: 'volunteers_needed must be provided and greater than 0' }, { status: 400 });
    }

    if (!validUntil || Number.isNaN(new Date(validUntil).getTime())) {
      return NextResponse.json({ error: 'valid_until must be a valid date string' }, { status: 400 });
    }

    const csrEligible = await ngoUserIsCsrEligible(decoded.id);
    if (!csrEligible) {
      return NextResponse.json({ error: CSR_PROJECT_CREATE_REQUIRED_MESSAGE }, { status: 403 });
    }
    const csrCoversTimeline = await ngoUserIsCsrEligibleForProject(decoded.id, {
      valid_until: validUntil,
      timeline,
    });
    if (!csrCoversTimeline) {
      return NextResponse.json({ error: CSR_OWN_PROJECT_TIMELINE_MESSAGE }, { status: 403 });
    }

    const project = await db.requestProjects.create({
      ngo_id: decoded.id,
      title,
      description: withProjectMeta(description, {
        category: String(body.category || '').trim() || null,
        budget_inr: body.budget_inr != null ? Number(body.budget_inr) || null : null,
        impact_description: String(body.impact_description || '').trim() || null,
        contact_info: String(body.contact_info || body.contactInfo || '').trim() || null,
        // Never accept client-supplied pending applications on create.
      }),
      location: locationSummary,
      exact_address: serializedAddress,
      timeline: timeline || null,
      volunteers_needed: volunteersNeeded,
      expected_beneficiaries: expectedBeneficiaries,
      valid_until: validUntil ? new Date(validUntil).toISOString() : null,
      csr_project_available_for_csr: true,
      status: 'active'
    });

    return NextResponse.json({ success: true, data: project });
  } catch (error) {
    console.error('Failed to create service request project:', error);
    return NextResponse.json({ error: 'Failed to create service request project' }, { status: 500 });
  }
}