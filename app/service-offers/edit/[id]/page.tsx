'use client'

import { use, useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'

import { Header } from '@/components/header'
import ProtectedRoute from '@/components/protected-route'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/hooks/use-toast'
import { toNullablePositiveNumber } from '@/lib/service-offers'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { buildServiceOfferPayload, validateServiceOfferForm } from '@/components/service-offer-form/helpers'
import { offerToFormData, type ServiceOfferResponse } from '@/components/service-offer-form/offer-to-form-data'
import { ServiceOfferFormFields } from '@/components/service-offer-form/service-offer-form-fields'
import type { ServiceOfferFormData } from '@/components/service-offer-form/types'
import { useServiceOfferForm } from '@/components/service-offer-form/use-service-offer-form'

const validateRentalUnitRate = (formData: ServiceOfferFormData) => {
  if (formData.transaction_type === 'rent' && toNullablePositiveNumber(formData.unit_rate) === null) {
    return 'Please enter a valid daily rental rate (INR/day).'
  }
  return null
}

export default function EditServiceOfferPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  const { user, token } = useAuth()
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const form = useServiceOfferForm(token)
  const { setFormData } = form

  useEffect(() => {
    if (!resolvedParams.id || !token) return

    const fetchOffer = async () => {
      try {
        const response = await fetch(`/api/service-offers/${resolvedParams.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        })

        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Failed to fetch service offer')

        const offer: ServiceOfferResponse = data?.data ?? data
        setFormData(offerToFormData(offer))
      } catch (error) {
        toast({
          title: 'Error',
          description: error instanceof Error ? error.message : 'Failed to fetch service offer',
          variant: 'destructive'
        })
        router.push('/service-offers')
      } finally {
        setLoading(false)
      }
    }

    fetchOffer()
  }, [resolvedParams.id, router, setFormData, toast, token])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    if (!token) {
      toast({ title: 'Authentication Error', description: 'Please log in to continue.', variant: 'destructive' })
      return
    }

    const validationError = validateServiceOfferForm(form.formData) ?? validateRentalUnitRate(form.formData)
    if (validationError) {
      toast({ title: 'Validation Error', description: validationError, variant: 'destructive' })
      return
    }

    const payload = buildServiceOfferPayload(form.formData)

    setSubmitting(true)

    try {
      const response = await fetch(`/api/service-offers/${resolvedParams.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update service offer')
      }

      toast({ title: 'Capability Offer Updated', description: data.data?.message || 'Offer updated successfully.' })
      router.push('/service-offers?view=my-offers')
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Unexpected error while updating offer',
        variant: 'destructive'
      })
    } finally {
      setSubmitting(false)
    }
  }

  if (!user) return null

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
            <h1 className="text-3xl font-bold text-gray-900">Edit Capability Offer</h1>
            <p className="text-gray-600 mt-2">Update your offer with impact areas, details, pricing, and capabilities.</p>
          </div>

          {loading ? (
            <Card>
              <CardContent className="py-12 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin" />
              </CardContent>
            </Card>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <ServiceOfferFormFields form={form} />

              <div className="flex gap-4">
                <Button type="submit" disabled={submitting} className="flex-1">
                  {submitting ? 'Updating...' : 'Update Capability Offer'}
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
