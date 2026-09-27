'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus } from 'lucide-react'

import { Header } from '@/components/header'
import ProtectedRoute from '@/components/protected-route'
import { useAuth } from '@/lib/auth-context'

import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AI_DRAFT_STORAGE_KEY, buildNeedPayload, createEmptyNeed, needsFromDraft, validateNeed } from './helpers'
import { NeedCard } from './need-card'
import { getNeedRecommendations } from './recommendations'
import { RelatedOffersSidebar } from './related-offers-sidebar'
import type { AIGeneratedDraft, NeedDraft } from './types'
import { useNeedImageUpload } from './use-need-image-upload'
import { useNeedRecommendations } from './use-need-recommendations'

export default function CreateServiceRequestPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [needs, setNeeds] = useState<NeedDraft[]>([createEmptyNeed()])
  const [selectedOffersByNeed, setSelectedOffersByNeed] = useState<Record<number, number[]>>({})

  useEffect(() => {
    const rawDraft = localStorage.getItem(AI_DRAFT_STORAGE_KEY)
    if (!rawDraft) {
      return
    }

    try {
      const draft = JSON.parse(rawDraft) as AIGeneratedDraft
      if (draft?.source !== 'ngo-ai-agent') {
        return
      }

      // Project-only drafts are ignored; this page only creates standalone needs.
      const generatedNeeds = needsFromDraft(draft)
      if (generatedNeeds.length > 0) {
        setNeeds(generatedNeeds)
      }
    } catch {
      // Ignore malformed local draft payload.
    } finally {
      localStorage.removeItem(AI_DRAFT_STORAGE_KEY)
    }
  }, [])

  const { serviceOffers, offersLoading, serverRecommendations, refreshNeedRecommendations } = useNeedRecommendations(needs)
  const { needUploadProgress, handleNeedImageFiles, removeNeedImageUrl } = useNeedImageUpload(setNeeds, setError)

  const updateNeed = (index: number, field: keyof NeedDraft, value: string) => {
    setNeeds((prev) => prev.map((need, needIndex) => (needIndex === index ? { ...need, [field]: value } : need)))
  }

  const addNeed = () => {
    setNeeds((prev) => [...prev, createEmptyNeed()])
  }

  const removeNeed = (index: number) => {
    setNeeds((prev) => prev.length === 1 ? prev : prev.filter((_, needIndex) => needIndex !== index))
    setSelectedOffersByNeed((prev) => {
      const next: Record<number, number[]> = {}
      Object.entries(prev).forEach(([key, value]) => {
        const currentIndex = Number(key)
        if (currentIndex < index) {
          next[currentIndex] = value
        } else if (currentIndex > index) {
          next[currentIndex - 1] = value
        }
      })
      return next
    })
  }

  const setNeedCount = (count: number) => {
    const safeCount = Number.isFinite(count) ? Math.max(1, Math.min(20, Math.floor(count))) : 1
    setNeeds((prev) => {
      if (safeCount === prev.length) return prev
      if (safeCount > prev.length) {
        return [...prev, ...Array.from({ length: safeCount - prev.length }, () => createEmptyNeed())]
      }
      return prev.slice(0, safeCount)
    })
    setSelectedOffersByNeed((prev) => {
      const next: Record<number, number[]> = {}
      Object.entries(prev).forEach(([key, value]) => {
        const index = Number(key)
        if (index < safeCount) {
          next[index] = value
        }
      })
      return next
    })
  }

  const getRecommendationsForNeed = (need: NeedDraft, index: number) => {
    const serverRecs = serverRecommendations[index]
    return serverRecs && serverRecs.length > 0 ? serverRecs : getNeedRecommendations(need, serviceOffers)
  }

  const applyOfferToNeed = async (offerId: number, needIndex: number, createdNeedId?: number) => {
    setSelectedOffersByNeed((prev) => ({
      ...prev,
      [needIndex]: Array.from(new Set([...(prev[needIndex] || []), offerId]))
    }))

    const needId = Number(createdNeedId || 0)
    if (!Number.isFinite(needId) || needId <= 0) return

    try {
      const response = await fetch(`/api/service-offers/${offerId}/clients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: user?.id,
          client_type: user?.user_type,
          selected_need_ids: [needId],
          message: `Applying for need ${needId}`
        })
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        toast({ title: 'Apply failed', description: err.error || 'Could not apply to offer', variant: 'destructive' })
        return
      }

      toast({ title: 'Applied', description: 'Application submitted to the offer owner.' })
    } catch (err) {
      console.error('Error applying to offer:', err)
      toast({ title: 'Apply failed', description: 'Could not apply to offer', variant: 'destructive' })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!user) {
      setError('You must be logged in to create a need')
      return
    }

    if (needs.length === 0) {
      setError('Add at least one need.')
      return
    }

    for (const [index, need] of needs.entries()) {
      const validationError = validateNeed(need, index)
      if (validationError) {
        setError(validationError)
        return
      }
    }

    setLoading(true)
    setError('')

    try {
      const token = localStorage.getItem('token')
      const creationResults: Array<{ ok: boolean; error?: string }> = []

      for (let index = 0; index < needs.length; index += 1) {
        const need = needs[index]
        const selectedOfferIds = selectedOffersByNeed[index] || []
        const matchedRecommendations = getNeedRecommendations(need, serviceOffers).filter((item) => selectedOfferIds.includes(item.offer.id))

        const response = await fetch('/api/service-requests', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(buildNeedPayload(need, selectedOfferIds, matchedRecommendations))
        })

        const data = await response.json()
        if (!response.ok || !data.success) {
          creationResults.push({ ok: false, error: data.error || data.message || `Failed on need ${index + 1}` })
          break
        }

        const createdId = Number(data?.data?.id || data?.id || 0)
        if (Number.isFinite(createdId) && createdId > 0 && selectedOfferIds.length > 0) {
          for (const offerId of selectedOfferIds) {
            try {
              // eslint-disable-next-line no-await-in-loop
              await applyOfferToNeed(offerId, index, createdId)
            } catch (err) {
              console.error('Error applying to offer after create:', err)
            }
          }
        }

        creationResults.push({ ok: true })
      }

      const successfulCount = creationResults.filter((result) => result.ok).length

      if (successfulCount === needs.length) {
        router.push('/service-requests')
        return
      }

      const failure = creationResults.find((result) => !result.ok)
      setError(failure?.error || 'Failed to create all needs')
    } catch {
      setError('Error creating need')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ProtectedRoute userTypes={['ngo']} requireVerification={true} permission="canCreateServiceRequests">
      <div className="flex min-h-screen flex-col">
        <Header />

        <main className="flex-1 px-4 py-6 sm:px-6 md:px-10">
          <div className="mb-8">
            <Button variant="ghost" onClick={() => router.back()} className="mb-4 px-0 text-sm text-muted-foreground hover:text-foreground hover:bg-transparent active:bg-transparent focus-visible:bg-transparent focus-visible:ring-0">
              <ArrowLeft size={16} className="mr-2" />
              Back
            </Button>

            <h1 className="text-3xl font-bold tracking-tight">Post Needs for Individuals</h1>
            <p className="text-muted-foreground">
              Publish standalone needs with location, Schedule VII category, timeline, and beneficiaries.{' '}
              <Link href="/service-requests/projects/create" className="text-primary underline-offset-4 hover:underline">
                Create a CSR project instead
              </Link>
              .
            </p>
          </div>

          <div className="mx-auto w-full max-w-7xl">
            <Card>
              <CardHeader>
                <CardTitle>Need Details</CardTitle>
                <CardDescription>Every need must define who benefits, how many, and what measurable change will happen.</CardDescription>
              </CardHeader>

              <CardContent>
                {error && (
                  <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-red-700 text-sm">{error}</p>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
                    <div className="space-y-6">
                      <div className="space-y-6">
                        <div className="rounded-lg border p-4 bg-muted/30">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <h3 className="font-semibold">Need List</h3>
                              <p className="text-sm text-muted-foreground">Add as many separate needs as you want to post.</p>
                            </div>
                            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                              <Label htmlFor="need_count" className="text-sm text-muted-foreground">Number of needs</Label>
                              <Input
                                id="need_count"
                                type="number"
                                min="1"
                                max="20"
                                value={needs.length}
                                onChange={(e) => setNeedCount(Number(e.target.value))}
                                className="w-full sm:w-24"
                              />
                              <Button type="button" variant="outline" onClick={addNeed} className="w-full sm:w-auto">
                                <Plus size={16} className="mr-2" />
                                Add Need
                              </Button>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-6">
                          {needs.map((need, index) => (
                            <NeedCard
                              key={index}
                              need={need}
                              index={index}
                              uploadProgress={needUploadProgress[index]}
                              onChange={(field, value) => updateNeed(index, field, value)}
                              onRemove={() => removeNeed(index)}
                              onImageFiles={(files) => void handleNeedImageFiles(index, files)}
                              onRemoveImage={(url) => removeNeedImageUrl(index, url)}
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    <RelatedOffersSidebar
                      needs={needs}
                      offersLoading={offersLoading}
                      selectedOffersByNeed={selectedOffersByNeed}
                      getRecommendations={getRecommendationsForNeed}
                      onRefresh={refreshNeedRecommendations}
                      onApply={(offerId, index) => void applyOfferToNeed(offerId, index)}
                    />
                  </div>
                  <div className="flex flex-col gap-3 pt-6 sm:flex-row">
                    <Button type="submit" disabled={loading} className="w-full flex-1">
                      {loading ? 'Creating...' : 'Create Execution Need'}
                    </Button>
                    <Button type="button" variant="outline" asChild className="w-full flex-1">
                      <Link href="/service-requests">Cancel</Link>
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  )
}
