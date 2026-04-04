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

    const projects = await db.requestProjects.getAll({
      ngo_id: ngoId ? Number(ngoId) : undefined,
      status: status || undefined
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

    return NextResponse.json({ success: true, data: filteredProjects });
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

    const project = await db.requestProjects.create({
      ngo_id: decoded.id,
      title,
      description,
      location: exactAddress,
      exact_address: exactAddress,
      timeline: timeline || null,
      status: 'active'
    });

    return NextResponse.json({ success: true, data: project });
  } catch (error) {
    console.error('Failed to create service request project:', error);
    return NextResponse.json({ error: 'Failed to create service request project' }, { status: 500 });
  }
}