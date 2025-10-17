'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { use } from 'react'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'

interface ProfileData {
  id: string
  full_name: string
  created_at: string
}

export default function PublicProfilePage({ params }: { params: Promise<{ userId: string }> }) {
  const router = useRouter()
  const resolvedParams = use(params)
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    // Simple fetch logic
    setLoading(false)
  }, [resolvedParams.userId])

  if (loading) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <div>Loading...</div>
        </main>
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Profile Not Found</h1>
            <Button onClick={() => router.back()}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Go Back
            </Button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="container mx-auto px-4 py-6">
        <div>Profile Content</div>
      </main>
    </div>
  )
}