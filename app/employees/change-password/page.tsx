'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import ProtectedRoute from '@/components/protected-route'
import { Header } from '@/components/header'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/lib/auth-context'
import { clientAuthHeaders } from '@/lib/client-session'
import { isCompanyEmployeeUserClient } from '@/lib/access-control'
import { smoothNavigate } from '@/lib/utils'
import { readApiError } from '@/lib/user-facing-error'

export default function EmployeeChangePasswordPage() {
  const { user, refreshUser } = useAuth()
  const router = useRouter()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!user) return
    if (!isCompanyEmployeeUserClient(user)) {
      smoothNavigate(router, '/individuals/dashboard', { delay: 0 })
      return
    }
    if (!user.must_change_password) {
      smoothNavigate(router, '/employees/dashboard', { delay: 0 })
    }
  }, [user, router])

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.')
      return
    }
    setSubmitting(true)
    try {
      const response = await fetch('/api/employee/change-password', {
        method: 'POST',
        credentials: 'include',
        headers: { ...clientAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) {
        setError(readApiError(payload, 'Failed to change password'))
        return
      }
      await refreshUser()
      smoothNavigate(router, '/employees/dashboard', { delay: 100 })
    } catch {
      setError('Failed to change password')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ProtectedRoute userTypes={['individual']}>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex flex-1 items-center justify-center p-4">
          <Card className="w-full max-w-md shadow-none">
            <CardHeader>
              <CardTitle>Change password</CardTitle>
              <CardDescription>
                You must set a new password before monitoring assigned CSR projects.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} className="space-y-4">
                {error ? (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ) : null}
                <div className="space-y-2">
                  <Label htmlFor="current-password">Current password</Label>
                  <Input
                    id="current-password"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">New password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    minLength={8}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm new password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    minLength={8}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? 'Saving…' : 'Save password'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </main>
      </div>
    </ProtectedRoute>
  )
}
