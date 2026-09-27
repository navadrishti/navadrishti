'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { Header } from '@/components/header'
import ProtectedRoute from '@/components/protected-route'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/hooks/use-toast'
import { dashboardProfilePayoutHref, usePayoutConnection } from '@/hooks/use-payout-connection'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { buildServiceOfferPayload, validateServiceOfferForm } from '@/components/service-offer-form/helpers'
import { ServiceOfferFormFields } from '@/components/service-offer-form/service-offer-form-fields'
import { useServiceOfferForm } from '@/components/service-offer-form/use-service-offer-form'

export default function CreateServiceOfferPage() {
  const router = useRouter()
  const { user, token } = useAuth()
  const { toast } = useToast()
  const { loading: payoutLoading, connected: payoutConnected } = usePayoutConnection(Boolean(user))

  const [loading, setLoading] = useState(false)
  const form = useServiceOfferForm(token)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    if (!token) {
      toast({ title: 'Authentication Error', description: 'Please log in to continue.', variant: 'destructive' })
      return
    }

    const validationError = validateServiceOfferForm(form.formData)
    if (validationError) {
      toast({ title: 'Validation Error', description: validationError, variant: 'destructive' })
      return
    }

    const payload = buildServiceOfferPayload(form.formData)

    setLoading(true)

    try {
      const response = await fetch('/api/service-offers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      })

      const data = await response.json()

      if (response.ok) {
        toast({ title: 'Capability Offer Created', description: data.data?.message || 'Offer submitted successfully.' })
        router.push('/service-offers?view=my-offers')
        return
      }

      toast({ title: 'Error', description: data.error || 'Failed to create service offer', variant: 'destructive' })
    } catch {
      toast({ title: 'Error', description: 'Unexpected error while creating offer', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  if (!user) return null

  const payoutHref = dashboardProfilePayoutHref(user.user_type)
  const payoutBlocked = !payoutLoading && payoutConnected === false

  return (
    <ProtectedRoute requireVerification={true} permission="canCreateServiceOffers">
      <div className="min-h-screen bg-background">
        <Header />

        <div className="max-w-4xl mx-auto p-6">
          <div className="mb-8">
            <Button variant="ghost" onClick={() => router.back()} className="mb-4 px-0 text-udaan-blue hover:text-gram-ink hover:bg-transparent active:bg-transparent focus-visible:bg-transparent focus-visible:ring-0">
              <ArrowLeft size={18} className="mr-2" />
              Back
            </Button>
            <h1 className="text-3xl font-bold text-gray-900">Create Capability Offer</h1>
            <p className="text-gray-600 mt-2">Publish what you can fund, supply, execute, or support.</p>
          </div>

          {payoutLoading ? (
            <Card>
              <CardContent className="py-8 text-sm text-muted-foreground">Checking Razorpay payout connection...</CardContent>
            </Card>
          ) : payoutBlocked ? (
            <Card>
              <CardHeader>
                <CardTitle>Connect Razorpay to list capabilities</CardTitle>
                <CardDescription>
                  You must connect Razorpay payout before listing capabilities so you can receive merchant payments.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <Link href={payoutHref}>Connect Razorpay payout</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <ServiceOfferFormFields form={form} />

              <div className="flex gap-4">
                <Button type="submit" disabled={loading} className="flex-1">
                  {loading ? 'Creating...' : 'Create Capability Offer'}
                </Button>
                <Button type="button" variant="outline" asChild>
                  <Link href="/service-offers">Cancel</Link>
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </ProtectedRoute>
  )
}
