"use client"

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Header } from '@/components/header'

export default function ProfilePage() {
  const router = useRouter()
  const { user, loading } = useAuth()

  useEffect(() => {
    if (loading) return

    if (!user) {
      router.replace('/login')
      return
    }

    const dashboardPath =
      user.user_type === 'company'
        ? '/companies/dashboard?tab=profile'
        : user.user_type === 'ngo'
          ? '/ngos/dashboard?tab=profile'
          : '/individuals/dashboard?tab=profile'

    router.replace(dashboardPath)
  }, [loading, user, router])

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 px-6 py-8 md:px-10">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-md border p-8 text-center text-muted-foreground">
            Redirecting to your dashboard profile tab...
          </div>
        </div>
      </main>
    </div>
  )
}
