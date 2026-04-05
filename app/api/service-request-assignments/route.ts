import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { supabase } from '@/lib/db'
import { JWT_SECRET } from '@/lib/auth'

interface JWTPayload {
  id: number;
  user_type: string;
  email: string;
  name: string;
}

const ongoingVolunteerStatuses = ['pending', 'accepted', 'active']
const historyVolunteerStatuses = ['completed', 'rejected', 'cancelled']

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload
    const { id: userId, user_type: userType } = decoded

    const { searchParams } = new URL(request.url)
    const view = searchParams.get('view') || 'ongoing'

    if (userType === 'individual') {
      let query = supabase
        .from('service_volunteers')
        .select(`
          *,
          request:service_requests!service_request_id(
            id,
            title,
            description,
            category,
            location,
            status,
            timeline,
            urgency_level,
            estimated_budget,
            beneficiary_count,
            project:service_request_projects!project_id(id, title, exact_address, location, timeline)
          )
        `)
        .eq('volunteer_id', userId)
        .order('updated_at', { ascending: false })

      if (view === 'ongoing') {
        query = query.in('status', ongoingVolunteerStatuses)
      } else if (view === 'history') {
        query = query.in('status', historyVolunteerStatuses)
      }

      const { data, error } = await query
      if (error) throw error

      return NextResponse.json({ success: true, data: data || [] })
    }

    if (userType === 'ngo') {
      const { data: requests, error } = await supabase
        .from('service_requests')
        .select(`
          *,
          project:service_request_projects!project_id(id, title, exact_address, location, timeline)
        `)
        .eq('ngo_id', userId)
        .order('created_at', { ascending: false })

      if (error) throw error

      const requestIds = (requests || []).map((item: any) => item.id)
      const { data: assignments, error: assignmentsError } = requestIds.length > 0
        ? await supabase
            .from('service_volunteers')
            .select(`
              *,
              volunteer:users!volunteer_id(id, name, email, user_type),
              request:service_requests!service_request_id(id, title, status, category, location, timeline, urgency_level, estimated_budget, beneficiary_count, project:service_request_projects!project_id(id, title, exact_address, location, timeline))
            `)
            .in('service_request_id', requestIds)
            .order('updated_at', { ascending: false })
        : { data: [], error: null }

      if (assignmentsError) throw assignmentsError

      const grouped = (requests || []).map((requestItem: any) => {
        const relatedAssignments = (assignments || []).filter((assignment: any) => String(assignment.service_request_id) === String(requestItem.id))
        return {
          ...requestItem,
          assignments: relatedAssignments,
          accepted_count: relatedAssignments.filter((item: any) => ['accepted', 'active', 'completed'].includes(String(item.status || '').toLowerCase())).length,
          completed_count: relatedAssignments.filter((item: any) => {
            const status = String(item.status || '').toLowerCase()
            return status === 'completed' || item.ngo_confirmed_at
          }).length
        }
      })

      const filtered = view === 'history'
        ? grouped.filter((item: any) => ['completed', 'cancelled'].includes(String(item.status || '').toLowerCase()))
        : grouped.filter((item: any) => !['completed', 'cancelled'].includes(String(item.status || '').toLowerCase()))

      return NextResponse.json({ success: true, data: filtered })
    }

    return NextResponse.json({ error: 'Unsupported user type' }, { status: 403 })
  } catch (error) {
    console.error('Error fetching assignments:', error)
    return NextResponse.json({ error: 'Failed to fetch assignments' }, { status: 500 })
  }
}