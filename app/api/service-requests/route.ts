import { NextRequest, NextResponse } from 'next/server';
import { db, executeQuery } from '@/lib/db';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '@/lib/auth';

// Interface for JWT payload
interface JWTPayload {
  id: number;
  user_type: string;
  email: string;
  name: string;
}

// GET - Fetch service requests (public endpoint - no auth required for viewing)
export async function GET(request: NextRequest) {
  try {
    // Get query parameters
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const search = searchParams.get('search');
    const userId = searchParams.get('userId');
    const view = searchParams.get('view'); // 'all', 'my-requests', 'volunteering'

    // Build query based on filters
    let query = `
      SELECT 
        sr.*,
        u.name as ngo_name,
        u.email as ngo_email,
        COUNT(sv.id) as volunteer_count
      FROM service_requests sr
      JOIN users u ON sr.ngo_id = u.id
      LEFT JOIN service_volunteers sv ON sr.id = sv.service_request_id
      WHERE sr.status IN ('open', 'active')
    `;
    const values: any[] = [];

    // Add filters
    if (category && category !== 'All Categories') {
      query += ' AND sr.category = ?';
      values.push(category);
    }

    if (search) {
      query += ' AND (sr.title LIKE ? OR sr.description LIKE ? OR sr.tags LIKE ?)';
      const searchPattern = `%${search}%`;
      values.push(searchPattern, searchPattern, searchPattern);
    }

    // Handle different views (only if userId is provided)
    if (view === 'my-requests' && userId) {
      query += ' AND sr.ngo_id = ?';
      values.push(parseInt(userId));
    } else if (view === 'volunteering' && userId) {
      query += ' AND sr.id IN (SELECT service_request_id FROM service_volunteers WHERE volunteer_id = ?)';
      values.push(parseInt(userId));
    }

    // Use Supabase database helpers
    const filters: any = {};
    if (category && category !== 'All Categories') {
      filters.category = category;
    }
    if (view === 'my-requests' && userId) {
      filters.ngo_id = parseInt(userId);
    }

    const serviceRequests = await db.serviceRequests.getAll(filters);

    // Process the data to handle old and new formats
    const processedRequests = serviceRequests.map((request) => {
      // Handle old concatenated description format
      if (request.description && (request.description.includes('Budget:') || request.description.includes('Requirements:'))) {
        // Split by newlines and extract parts
        const lines = request.description.split('\n');
        request.description = lines[0]; // Just the actual description
        
        // Extract additional info from the concatenated format
        const fullText = lines.join('\n');
        const budgetMatch = fullText.match(/Budget:\s*([^\n]*)/);
        const contactMatch = fullText.match(/Contact:\s*([^\n]*)/);
        const timelineMatch = fullText.match(/Timeline:\s*([^\n]*)/);
        
        // Store the extracted info in requirements field for consistency
        try {
          const existingRequirements = request.requirements ? JSON.parse(request.requirements) : {};
          request.requirements = JSON.stringify({
            budget: budgetMatch ? budgetMatch[1].trim() : null,
            contactInfo: contactMatch ? contactMatch[1].trim() : null,
            timeline: timelineMatch ? timelineMatch[1].trim() : null
          });
          
          // Update deadline with timeline if found
          if (timelineMatch && timelineMatch[1].trim()) {
            request.deadline = timelineMatch[1].trim();
          }
        } catch (e) {
          // If parsing fails, leave as is
          console.error('Error parsing old format data:', e);
        }
      }
      
      // Handle fake deadline - clear timestamp-style deadlines
      const deadlineStr = String(request.deadline || '');
      if (deadlineStr && (deadlineStr.includes('T') && deadlineStr.includes('Z'))) {
        request.deadline = null;
      }
      
      return request;
    });

    return NextResponse.json({
      success: true,
      data: processedRequests
    });

  } catch (error) {
    console.error('Error fetching service requests:', error);
    return NextResponse.json(
      { error: 'Failed to fetch service requests' },
      { status: 500 }
    );
  }
}

// POST - Create new service request (NGOs only) or volunteer for request
export async function POST(request: NextRequest) {
  try {
    // Get JWT token from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    const { id: userId, user_type: userType } = decoded;

    const body = await request.json();
    const { action } = body;

    // If no action is specified, assume it's a create operation
    if (!action || action === 'create') {
      // Only NGOs can create service requests
      if (userType !== 'ngo') {
        return NextResponse.json({ error: 'Only NGOs can create service requests' }, { status: 403 });
      }

      const { 
        title, 
        description, 
        category,
        location,
        urgency,
        timeline,
        budget,
        contactInfo
      } = body;

      // Validate required fields
      if (!title || !description || !category) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
      }

      // Map urgency to database enum values
      const urgencyMap: { [key: string]: string } = {
        'Low': 'low',
        'Medium': 'medium',
        'High': 'high',
        'Critical': 'critical'
      };
      const mappedUrgency = urgencyMap[urgency] || 'medium';

      // Prepare requirements JSON
      const requirementsData = {
        budget: budget || 'Not specified',
        contactInfo: contactInfo || 'Not specified',
        timeline: timeline || 'Not specified'
      };

      // Insert new service request using Supabase helpers
      const requestData = {
        ngo_id: userId,
        title: title,
        description: description,
        category: category,
        location: location,
        urgency_level: mappedUrgency,
        volunteers_needed: 1, // default volunteers_needed
        tags: JSON.stringify([]), // empty tags array
        requirements: JSON.stringify(requirementsData),
        status: 'active'
      };

      const result = await db.serviceRequests.create(requestData);

        return NextResponse.json({
          success: true,
          data: { id: result.id, message: 'Service request created successfully' }
        });    } else if (action === 'volunteer') {
      // Only individuals and companies can volunteer
      if (userType === 'ngo') {
        return NextResponse.json({ error: 'NGOs cannot volunteer for their own requests' }, { status: 403 });
      }

      const { serviceRequestId, message } = body;

      if (!serviceRequestId) {
        return NextResponse.json({ error: 'Service request ID is required' }, { status: 400 });
      }

      // Check if already volunteering using raw SQL (helper not implemented)
      const existing = await executeQuery({
        query: 'SELECT id FROM service_volunteers WHERE service_request_id = ? AND volunteer_id = ?',
        values: [serviceRequestId, userId]
      }) as any[];

      if (existing.length > 0) {
        return NextResponse.json({ error: 'Already volunteering for this request' }, { status: 400 });
      }

      // Add volunteer using raw SQL (helper not implemented)
      await executeQuery({
        query: `
          INSERT INTO service_volunteers (
            service_request_id, volunteer_id, volunteer_type, message, status
          ) VALUES (?, ?, ?, ?, 'pending')
        `,
        values: [serviceRequestId, userId, userType, message || '']
      });

      return NextResponse.json({
        success: true,
        data: { message: 'Successfully volunteered for service request' }
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('Error processing service request:', error);
    return NextResponse.json(
      { error: 'Failed to process service request' },
      { status: 500 }
    );
  }
}