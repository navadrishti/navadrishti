import { NextRequest } from 'next/server';
import { executeQuery } from '@/lib/db';
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

    let query = `
      SELECT psv.*, u.name as ngo_name
      FROM people_skills_verification psv
      LEFT JOIN users u ON psv.ngo_id = u.id
      WHERE psv.ngo_id = ?
    `;
    
    const values: any[] = [user.id];

    if (status && status !== 'all') {
      query += ' AND psv.verification_status = ?';
      values.push(status);
    }

    query += ' ORDER BY psv.created_at DESC';

    const records = await executeQuery({
      query,
      values
    }) as any[];

    // Parse JSON fields
    const formattedRecords = records.map(record => ({
      ...record,
      work_photos: record.work_photos ? JSON.parse(record.work_photos) : []
    }));

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
    const result = await executeQuery({
      query: `
        INSERT INTO people_skills_verification (
          name, ngo_id, ngo_affiliation, age, contact_number, aadhaar_number,
          skillset, past_work, experience, profile_picture_url, work_photos,
          verification_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      values: [
        name,
        user.id,
        ngoAffiliation || user.name,
        age || null,
        contactNumber,
        aadharCard,
        skillset || null,
        pastWork || null,
        experience || null,
        profilePicture || null,
        JSON.stringify(workPhotos || []),
        isDraft ? 'draft' : 'pending_digilocker'
      ]
    }) as any;

    return Response.json({
      success: true,
      message: isDraft ? 'Record saved as draft' : 'Record submitted for verification',
      recordId: result.insertId
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