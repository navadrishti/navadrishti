'use client'

import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, XCircle } from 'lucide-react'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ApplyOfferCard } from './apply-offer-card'
import { CapabilityOfferDetailsSection } from './capability-offer-details-section'
import { ExistingApplicationPanel } from './existing-application-panel'
import { NeedSelectionForm } from './need-selection-form'
import { OfferDetailSkeleton } from './offer-detail-skeleton'
import { ProviderTab } from './provider-tab'
import { useServiceOffer } from './use-service-offer'

export default function ServiceOfferDetailPage() {
  const params = useParams()
  const router = useRouter()
  const offerId = params.id as string
  const {
    user,
    isAuthenticated,
    offer,
    userApplication,
    loading,
    applying,
    paying,
    selectedNeedIds,
    setSelectedNeedIds,
    ngoNeeds,
    loadingNgoNeeds,
    selectedNeedSummaries,
    selectedNeedTotal,
    isOfferExpired,
    handleApply,
    handlePayForApplication
  } = useServiceOffer(offerId)

  const canApplyToOffer = !!user && user.id !== offer?.creator_id && user.user_type === 'ngo'
  const canShowRespondTab = !isAuthenticated || canApplyToOffer

  if (loading) {
    return <OfferDetailSkeleton />
  }

  if (!offer) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="mx-auto max-w-7xl px-4 py-8">
          <Alert>
            <XCircle className="h-4 w-4" />
            <AlertDescription>
              Service offer not found
            </AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <Header />

      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6">
          <Button variant="ghost" onClick={() => router.back()} className="w-full justify-start px-0 text-udaan-blue hover:text-gram-ink hover:bg-transparent active:bg-transparent focus-visible:bg-transparent focus-visible:ring-0 sm:w-auto">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-12 min-w-0">
            <Card>
              <CardContent className="pt-6">
                <Tabs defaultValue="details" className="w-full">
                  <TabsList className="flex w-full gap-2 overflow-x-auto pb-1">
                    <TabsTrigger value="details" className="shrink-0 whitespace-nowrap">Capability Details</TabsTrigger>
                    {canShowRespondTab ? <TabsTrigger value="respond" className="shrink-0 whitespace-nowrap">Apply for Offer</TabsTrigger> : null}
                    <TabsTrigger value="provider" className="shrink-0 whitespace-nowrap">Service Provider</TabsTrigger>
                  </TabsList>

                  <TabsContent value="details" className="mt-4">
                    <CapabilityOfferDetailsSection offer={offer} />
                  </TabsContent>

                  <TabsContent value="provider" className="mt-4 space-y-5">
                    <ProviderTab offer={offer} isOfferExpired={isOfferExpired} />
                  </TabsContent>

                  {canShowRespondTab ? (
                    <TabsContent value="respond" className="mt-4">
                      <ApplyOfferCard
                        isAuthenticated={isAuthenticated}
                        canApplyToOffer={canApplyToOffer}
                        isUnverified={!!user && user.verification_status !== 'verified'}
                        existingApplication={
                          userApplication ? (
                            <ExistingApplicationPanel
                              application={userApplication}
                              offerPriceAmount={offer.price_amount}
                              paying={paying}
                              onPay={handlePayForApplication}
                            />
                          ) : null
                        }
                        needSelectionForm={
                          <NeedSelectionForm
                            ngoNeeds={ngoNeeds}
                            loadingNgoNeeds={loadingNgoNeeds}
                            selectedNeedIds={selectedNeedIds}
                            onSelectedNeedIdsChange={setSelectedNeedIds}
                            selectedNeedSummaries={selectedNeedSummaries}
                            selectedNeedTotal={selectedNeedTotal}
                            applying={applying}
                            onApply={handleApply}
                          />
                        }
                      />
                    </TabsContent>
                  ) : null}
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
