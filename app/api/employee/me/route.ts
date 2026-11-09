import { NextRequest, NextResponse } from 'next/server'
import { assertActiveCompanyEmployee } from '@/lib/company-employee'
import { supabase } from '@/lib/db'
import { getAuthUserFromRequest, authErrorResponse } from '@/lib/server-auth'

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(request)
    const identity = await assertActiveCompanyEmployee(user, { allowPasswordChangePending: true })

    const { data: parent } = await supabase
      .from('users')
      .select('id, name, email')
      .eq('id', identity.company_user_id)
      .maybeSingle()

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
        identity: {
          id: identity.id,
          status: identity.status,
          must_change_password: identity.must_change_password,
          company_user_id: identity.company_user_id,
          last_login_at: identity.last_login_at,
        },
        company: parent
          ? { id: parent.id, name: parent.name, email: parent.email }
          : { id: identity.company_user_id, name: null, email: null },
      },
    })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    console.error('Employee me error:', error)
    return NextResponse.json({ error: 'Failed to load employee profile' }, { status: 500 })
  }
}
