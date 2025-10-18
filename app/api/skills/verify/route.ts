import { NextRequest } from 'next/server';
import { supabase } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET - Fetch all people skills verification records for an NGO
export async function GET(request: NextRequest) {
  try {
    // Get authenticated user
    const authHeader = request.headers.get('authorization');
    const cookieToken = request.cookies.get('token')?.value;
    
    let token;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (cookieToken) {
      token = cookieToken;
    } else {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    const user = verifyToken(token);
    if (!user) {
      return Response.json({ error: 'Invalid authentication' }, { status: 401 });
    }

    // Only NGOs can access this endpoint
    if (user.user_type !== 'ngo') {
      return Response.json({ error: 'Access denied. NGO access required.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    let query = supabase
      .from('people_skills_verification')
      .select(`
        *,
        ngo:users!ngo_id(name)
      `)
      .eq('ngo_id', user.id);

    if (status && status !== 'all') {
      query = query.eq('verification_status', status);
    }

    const { data: records, error } = await query
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    // Parse JSON fields
    const formattedRecords = records?.map(record => ({
      ...record,
      work_photos: record.work_photos ? JSON.parse(record.work_photos) : []
    })) || [];

    return Response.json({
      success: true,
      records: formattedRecords
    });

  } catch (error: any) {
    console.error('Skills verification fetch error:', error);
    return Response.json({
      success: false,
      error: 'Failed to fetch records',
      details: error.message
    }, { status: 500 });
  }
}

// POST - Create new people skills verification record
export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const authHeader = request.headers.get('authorization');
    const cookieToken = request.cookies.get('token')?.value;
    
    let token;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (cookieToken) {
      token = cookieToken;
    } else {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    const user = verifyToken(token);
    if (!user) {
      return Response.json({ error: 'Invalid authentication' }, { status: 401 });
    }

    // Only NGOs can create verification records
    if (user.user_type !== 'ngo') {
      return Response.json({ error: 'Access denied. NGO access required.' }, { status: 403 });
    }

    const body = await request.json();
    const {
      name,
      ngoAffiliation,
      age,
      contactNumber,
      aadharCard,
      skillset,
      pastWork,
      experience,
      profilePicture,
      workPhotos,
      isDraft
    } = body;

    // Validation
    if (!name || !contactNumber || !aadharCard) {
      return Response.json({
        error: 'Name, contact number, and Aadhaar card are required'
      }, { status: 400 });
    }

    // Insert new record
    const { data: result, error } = await supabase
      .from('people_skills_verification')
      .insert({
        name: name,
        ngo_id: user.id,
        ngo_affiliation: ngoAffiliation || user.name,
        age: age || null,
        contact_number: contactNumber,
        aadhaar_number: aadharCard,
        skillset: skillset || null,
        past_work: pastWork || null,
        experience: experience || null,
        profile_picture_url: profilePicture || null,
        work_photos: JSON.stringify(workPhotos || []),
        verification_status: isDraft ? 'draft' : 'pending_digilocker'
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return Response.json({
      success: true,
      message: isDraft ? 'Record saved as draft' : 'Record submitted for verification',
      recordId: result.id
    });

  } catch (error: any) {
    console.error('Skills verification creation error:', error);
    return Response.json({
      success: false,
      error: 'Failed to create record',
      details: error.message
    }, { status: 500 });
  }
}