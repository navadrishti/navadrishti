import { NextRequest, NextResponse } from 'next/server';
import { db, supabase } from '@/lib/db';
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

    // For my-requests view, authenticate user
    let authenticatedUserId = null;
    if (view === 'my-requests' || view === 'volunteering') {
      const authHeader = request.headers.get('authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
      }

      const token = authHeader.substring(7);
      try {
        const payload = jwt.verify(token, JWT_SECRET) as JWTPayload;
        authenticatedUserId = payload.id;
        
        if (view === 'my-requests') {
          // Only NGOs can have requests
          if (payload.user_type !== 'ngo') {
            return NextResponse.json({ 
              success: true, 
              data: [] // Return empty array for non-NGOs
            });
          }
        } else if (view === 'volunteering') {
          // Only individuals and companies can volunteer
          if (payload.user_type === 'ngo') {
            return NextResponse.json({ 
              success: true, 
              data: [] // Return empty array for NGOs
            });
          }
        }
      } catch (error) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
      }
    }

    // Use Supabase database helpers
    const filters: any = {};
    if (category && category !== 'All Categories') {
      filters.category = category;
    }
    if (view === 'my-requests' && authenticatedUserId) {
      filters.requester_id = authenticatedUserId;
    }

    console.log('Service requests filters:', filters);
    
    let serviceRequests;
    if (view === 'volunteering' && authenticatedUserId) {
      // For volunteering view, get service requests where user has applied
      const volunteerApplications = await db.serviceVolunteers.getByVolunteerId(authenticatedUserId);
      const requestIds = volunteerApplications.map(app => app.service_request_id);
      
      if (requestIds.length === 0) {
        serviceRequests = [];
      } else {
        // Get the service requests for these IDs with filtering
        let query = supabase
          .from('service_requests')
          .select('*')
          .in('id', requestIds);
        
        // Apply category filter if specified
        if (category && category !== 'All Categories') {
          query = query.eq('category', category);
        }
        
        const { data, error } = await query;
        
        if (error) throw error;
        serviceRequests = data || [];
        
        // Fetch requester data separately and merge
        if (serviceRequests.length > 0) {
          const requesterIds = [...new Set(serviceRequests.map((item: any) => item.ngo_id))];
          const { data: users } = await supabase
            .from('users')
            .select('id, name, email, user_type')
            .in('id', requesterIds);
          
          // Merge requester data and volunteer application data
          serviceRequests = serviceRequests.map((request: any) => {
            const requester = users?.find((user: any) => user.id === request.ngo_id);
            const volunteerApp = volunteerApplications.find(app => app.service_request_id === request.id);
            
            return {
              ...request,
              requester,
              volunteer_application: volunteerApp,
              // Add requester_id for backward compatibility
              requester_id: request.ngo_id
            };
          });
        }
      }
    } else {
      serviceRequests = await db.serviceRequests.getAll(filters);
    }
    
    console.log('Service requests fetched:', serviceRequests?.length || 0, 'items');

  // Ensure we have an array to process and handle old/new formats
  const requestsToProcess = Array.isArray(serviceRequests) ? serviceRequests : [];
  // Process the data to handle old and new formats
  const processedRequests = requestsToProcess.map((request: any) => {
      // Add ngo_name for backward compatibility with frontend
      if (request.requester) {
        request.ngo_name = request.requester.name;
      }
      
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

    // Filter out completed requests from "All Requests" view
    let finalRequests = processedRequests;
    if (view === 'all') {
      console.log('Processing "all" view - checking volunteer limits for', processedRequests.length, 'requests');
      // For each request, check if it has reached its volunteer limit
      const safeProcessed = Array.isArray(processedRequests) ? processedRequests : [];

      const requestsWithVolunteerCount = await Promise.all(
        safeProcessed.map(async (request: any) => {
          // Defensive defaults in case request is unexpectedly null/undefined
          if (!request || typeof request !== 'object') {
            console.warn('Skipping invalid request during volunteer count:', request);
            return { accepted_volunteers_count: 0, is_full: false };
          }

          try {
            const { data: acceptedVolunteers, error: countError } = await supabase
              .from('service_volunteers')
              .select('id')
              .eq('service_request_id', request.id)
              .in('status', ['accepted', 'active', 'completed']);

            if (countError) {
              console.error('Supabase error counting volunteers for request', request.id, countError);
            }

            const acceptedCount = Array.isArray(acceptedVolunteers) ? acceptedVolunteers.length : 0;
            const volunteerLimit = request.volunteer_limit || request.volunteers_needed || 1;
            const isFull = acceptedCount >= volunteerLimit;

            console.log(`Request ${request.id}: ${acceptedCount}/${volunteerLimit} volunteers, is_full: ${isFull}`);

            return {
              ...request,
              accepted_volunteers_count: acceptedCount,
              is_full: isFull
            };
          } catch (error) {
            console.error('Error counting volunteers for request', request?.id, error);
            return {
              ...request,
              accepted_volunteers_count: 0,
              is_full: false
            };
          }
        })
      );

      // Filter out requests that are full (unless user is viewing their own requests)
      const filteredRequests = requestsWithVolunteerCount.filter((request: any) => !request.is_full);
      console.log('Filtered out', requestsWithVolunteerCount.length - filteredRequests.length, 'full requests from "all" view');
      finalRequests = filteredRequests;
    } else {
      console.log('Processing view:', view, 'with', processedRequests.length, 'requests (no filtering applied)');
    }

    return NextResponse.json({
      success: true,
      data: finalRequests
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
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    } catch (jwtError) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
    
    const { id: userId, user_type: userType, verification_status } = decoded;

    const body = await request.json();
    const { action } = body;

    // If no action is specified, assume it's a create operation
    if (!action || action === 'create') {

      
      // Only verified NGOs can create service requests
      if (userType !== 'ngo') {
        return NextResponse.json({ 
          error: 'Only verified NGOs can create service requests'
        }, { status: 403 });
      }
      
      if (verification_status !== 'verified') {
        return NextResponse.json({ 
          error: 'You need to complete verification before creating service requests.',
          requiresVerification: true
        }, { status: 403 });
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

      // Check if already volunteering using Supabase helper
      const existing = await db.serviceVolunteers.findExisting(serviceRequestId, userId);

      if (existing) {
        return NextResponse.json({ error: 'Already volunteering for this request' }, { status: 400 });
      }

      // Add volunteer using Supabase helper
      const volunteerData = {
        service_request_id: serviceRequestId,
        volunteer_id: userId,
        volunteer_type: userType,
        message: message || '',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      await db.serviceVolunteers.create(volunteerData);

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