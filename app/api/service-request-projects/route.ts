import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { db, supabase } from '@/lib/db';
import { JWT_SECRET } from '@/lib/auth';

interface JWTPayload {
  id: number;
  user_type: string;
  email: string;
  name: string;
  verification_status?: string;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ngoId = searchParams.get('ngoId');
    const status = searchParams.get('status');
    const includeEmpty = searchParams.get('includeEmpty') === 'true';
    const q = String(searchParams.get('q') || '').trim();

    const projects = await db.requestProjects.getAll({
      ngo_id: ngoId ? Number(ngoId) : undefined,
      status: status || undefined,
      q: q || undefined,
    });

    if (includeEmpty || projects.length === 0) {
      return NextResponse.json({ success: true, data: projects });
    }

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

    // remove obvious demo rows
    const nonDemo = filteredProjects.filter((p: any) => {
      const title = String(p.title || '').toLowerCase()
      return !title.includes('demo') && !title.includes('sample')
    })

    if (!q) {
      return NextResponse.json({ success: true, data: nonDemo });
    }

    const tokens = q.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).filter((t) => t.length > 2)

    const scored = nonDemo.map((p: any) => {
      let score = 0
      const hay = `${p.title || ''} ${p.description || ''} ${p.location || ''} ${p.timeline || ''}`.toLowerCase()
      for (const t of tokens) {
        if (hay.includes(t)) score += 8
      }
      // prefer projects with location matching query terms
      for (const t of tokens) {
        if ((p.location || '').toLowerCase().includes(t)) score += 12
      }
      // prefer recent projects
      if (p.created_at) {
        const ageDays = (Date.now() - new Date(p.created_at).getTime()) / (1000 * 60 * 60 * 24)
        if (ageDays < 30) score += 6
        else if (ageDays < 90) score += 3
      }
      return { project: p, score }
    }).sort((a: any, b: any) => b.score - a.score)

    return NextResponse.json({ success: true, data: scored.map((s: any) => s.project) });
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
    const description = String(body.description || '').trim();
    const exactAddress = String(body.exact_address || body.location || '').trim();
    const timeline = String(body.timeline || '').trim();

    if (!title || !exactAddress) {
      return NextResponse.json({ error: 'Project title and exact address are required' }, { status: 400 });
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

    const project = await db.requestProjects.create({
      ngo_id: decoded.id,
      title,
      description,
      location: exactAddress,
      exact_address: exactAddress,
      timeline: timeline || null,
      volunteers_needed: volunteersNeeded,
      expected_beneficiaries: expectedBeneficiaries,
      valid_until: validUntil || null,
      status: 'active'
    });

    return NextResponse.json({ success: true, data: project });
  } catch (error) {
    console.error('Failed to create service request project:', error);
    return NextResponse.json({ error: 'Failed to create service request project' }, { status: 500 });
  }
}