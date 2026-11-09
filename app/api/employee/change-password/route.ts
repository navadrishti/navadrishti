import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { comparePassword, hashPassword } from '@/lib/auth'
import {
  assertActiveCompanyEmployee,
  writeCompanyEmployeeAudit,
} from '@/lib/company-employee'
import { supabase } from '@/lib/db'
import {
  getAuthUserFromRequest,
  authErrorResponse,
  forgetSessionBlockReason,
} from '@/lib/server-auth'
import { zodIssuesToUserMessage } from '@/lib/user-facing-error'

const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8).max(128),
})

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(request)
    const identity = await assertActiveCompanyEmployee(user, { allowPasswordChangePending: true })

    const body = await request.json().catch(() => null)
    const parsed = changePasswordSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: zodIssuesToUserMessage(parsed.error.issues) || 'Please check your details and try again.' },
        { status: 400 }
      )
    }

    const { data: row, error: userError } = await supabase
      .from('users')
      .select('id, password')
      .eq('id', user.id)
      .single()

    if (userError || !row) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const valid = await comparePassword(parsed.data.current_password, row.password)
    if (!valid) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
    }

    const newHash = await hashPassword(parsed.data.new_password)
    const now = new Date().toISOString()
    const { error: updateError } = await supabase
      .from('users')
      .update({ password: newHash, updated_at: now })
      .eq('id', user.id)

    if (updateError) {
      console.error('Failed to change company employee password:', updateError)
      return NextResponse.json({ error: 'Failed to change password' }, { status: 500 })
    }

    await supabase
      .from('company_employee_identities')
      .update({ must_change_password: false, updated_at: now })
      .eq('id', identity.id)

    await writeCompanyEmployeeAudit({
      identityId: identity.id,
      eventType: 'company_employee_password_changed',
      companyUserId: identity.company_user_id,
      employeeUserId: user.id,
      actorUserId: user.id,
    })

    forgetSessionBlockReason(user.id)

    return NextResponse.json({ success: true, message: 'Password changed successfully' })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    console.error('Company employee change password error:', error)
    return NextResponse.json({ error: 'Failed to change password' }, { status: 500 })
  }
}
