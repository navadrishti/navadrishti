'use client'

import { useIsClient } from '@/hooks/use-is-client'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Building, XCircle, AlertTriangle } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { Header } from '@/components/header'
import { getFundingProgress, resolveFundingTargetInr } from '@/lib/service-request-allocation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getNeedFlags, parseRequirements } from './helpers'
import { useServiceRequestData } from './use-service-request-data'
import { useApplicantReview } from './use-applicant-review'
import { useVolunteerApplication } from './use-volunteer-application'
import { useContribution } from './use-contribution'
import { RequestNeedDetailsSection } from './need-details-section'
import { FundingProgressCard } from './funding-progress-card'
import { RequesterSection } from './requester-section'
import { ApplicantCard } from './applicant-card'
import { MyApplicationCard } from './my-application-card'
import { ApplyForm } from './apply-form'
import { ServiceRequestDetailSkeleton } from './detail-skeleton'

export default function ServiceRequestDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user, token } = useAuth()
  const isHydrated = useIsClient()

  const requestId = params.id as string
  const {
    request,
    loading,
    applicants,
    userApplication,
    setUserApplication,
    fetchRequestDetails,
    fetchApplicants,
    checkExistingApplication,
  } = useServiceRequestData(requestId)

  const isAuthenticated = !!(user && token)
  const effectiveUserType = isHydrated ? user?.user_type : undefined
  // Companies and NGOs act on needs from their dashboards, not from this tab.
  const canShowVolunteerTab = !isHydrated || (effectiveUserType !== 'company' && effectiveUserType !== 'ngo')
  const isNgoOwner = effectiveUserType === 'ngo' && request?.ngo_id === user?.id
  const canVolunteer = effectiveUserType === 'individual'

  const parsedRequirements = parseRequirements(request?.requirements)
  const infoRequestType = String(parsedRequirements?.request_type || request?.category || 'Not specified')
  const { isFinancialNeed, isMaterialNeed, isSkillServiceNeed, isInfrastructureNeed } = getNeedFlags(infoRequestType)
  const usesManualMarkDone =
    !isFinancialNeed && !isMaterialNeed && !isSkillServiceNeed && !isInfrastructureNeed
  const fundingTargetInr = resolveFundingTargetInr({
    funding_target_inr: request?.funding_target_inr ?? parsedRequirements?.funding_target_inr,
    target_amount: request?.target_amount,
    estimated_budget: parsedRequirements?.estimated_budget ?? request?.estimated_budget,
    budget: parsedRequirements?.budget,
  })
  const fundsRaisedInr = request?.funds_raised_inr ?? Number(request?.current_amount || 0)
  const funding = getFundingProgress(fundingTargetInr, fundsRaisedInr)
  const fundsRemainingInr = request?.funds_remaining_inr ?? funding.remaining
  const fundingProgress = request?.funding_progress ?? funding.progress
  const canPayForRequest = Boolean(isAuthenticated && canVolunteer && !isNgoOwner && request?.status !== 'completed' && request?.status !== 'cancelled')

  const review = useApplicantReview({ requestId, request, fetchApplicants, fetchRequestDetails })
  const volunteer = useVolunteerApplication({
    requestId,
    userApplication,
    setUserApplication,
    isFinancialRequest: isFinancialNeed,
    isSkillServiceNeed,
    fetchRequestDetails,
    checkExistingApplication,
  })
  const contribution = useContribution({ request, canPayForRequest, fetchRequestDetails })

  if (loading) {
    return <ServiceRequestDetailSkeleton />
  }

  if (!request) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="mx-auto max-w-7xl px-4 py-8">
          <Alert>
            <XCircle className="h-4 w-4" />
            <AlertDescription>
              Need not found
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
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="ghost" onClick={() => router.back()} className="w-full justify-start px-0 text-udaan-blue hover:text-gram-ink hover:bg-transparent active:bg-transparent focus-visible:bg-transparent focus-visible:ring-0 sm:w-auto">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          {isNgoOwner && (
            <Link href={`/service-requests/edit/${request.id}`}>
              <Button variant="outline" className="w-full sm:w-auto">Edit Need</Button>
            </Link>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-12 min-w-0">
            <Card>
              <CardContent className="pt-6">
              <Tabs defaultValue="details" className="w-full">
                  <TabsList className="flex w-full gap-2 overflow-x-auto pb-1">
                    <TabsTrigger value="details" className="shrink-0 whitespace-nowrap">Need Details</TabsTrigger>
                    {canShowVolunteerTab && !isFinancialNeed ? <TabsTrigger value="volunteer" className="shrink-0 whitespace-nowrap">Volunteer</TabsTrigger> : null}
                    <TabsTrigger value="requester" className="shrink-0 whitespace-nowrap">Requester</TabsTrigger>
                  </TabsList>

                  <TabsContent value="details" className="mt-4 space-y-4">
                    <RequestNeedDetailsSection request={request} />

                    {isFinancialNeed && (
                      <FundingProgressCard
                        isCompleted={request.status === 'completed'}
                        fundingProgress={fundingProgress}
                        fundingTargetInr={fundingTargetInr}
                        fundsRaisedInr={fundsRaisedInr}
                        fundsRemainingInr={fundsRemainingInr}
                        canPayForRequest={canPayForRequest}
                        contribution={contribution}
                      />
                    )}
                  </TabsContent>

                  <TabsContent value="requester" className="mt-4 space-y-5">
                    <RequesterSection request={request} />
                  </TabsContent>

                  <TabsContent value="volunteer" className="mt-4">
                    {!canShowVolunteerTab || isFinancialNeed ? null : (
                      <>
                        {!isAuthenticated && (
                          <div className="text-center space-y-4">
                            <p className="text-muted-foreground">Log in to volunteer (individual) or fulfill via CSR (company).</p>
                            <Button asChild className="w-full">
                              <Link href="/login">Log In</Link>
                            </Button>
                          </div>
                        )}

                        {isAuthenticated && isNgoOwner && (
                          <div className="space-y-4">
                            {applicants.length === 0 ? (
                              <Alert>
                                <AlertDescription>
                                  No invitations yet for this request.
                                </AlertDescription>
                              </Alert>
                            ) : (
                              applicants.map((applicant) => (
                                <ApplicantCard
                                  key={applicant.id}
                                  applicant={applicant}
                                  isFinancialNeed={isFinancialNeed}
                                  isMaterialNeed={isMaterialNeed}
                                  review={review}
                                />
                              ))
                            )}
                          </div>
                        )}

                        {isAuthenticated && effectiveUserType === 'company' && (
                          <Alert>
                            <Building className="h-4 w-4" />
                            <AlertDescription>
                              Companies cannot volunteer from need details. Use project details or the CSR dashboard for company actions.
                            </AlertDescription>
                          </Alert>
                        )}

                        {isAuthenticated && effectiveUserType === 'ngo' && !isNgoOwner && (
                          <Alert>
                            <XCircle className="h-4 w-4" />
                            <AlertDescription>
                              NGOs create needs. Only verified individuals can volunteer from need details.
                            </AlertDescription>
                          </Alert>
                        )}

                        {isAuthenticated && user && user.verification_status !== 'verified' && (
                          <div className="space-y-4">
                            <Alert>
                              <AlertTriangle className="h-4 w-4" />
                              <AlertDescription>
                                Account verification required to apply for volunteer opportunities.
                              </AlertDescription>
                            </Alert>

                            <div className="p-4 bg-amber-50 border border-amber-200 rounded-md">
                              <div className="flex items-start gap-3">
                                <div className="text-amber-600"></div>
                                <div>
                                  <p className="text-amber-800 font-medium text-sm">Verification Required</p>
                                  <p className="text-amber-700 text-sm mt-1">
                                    You need to complete identity verification (Aadhaar & PAN) before you can apply for volunteer opportunities.
                                    <Link href="/verification" className="underline font-medium ml-1 hover:text-amber-900">
                                      Complete verification now
                                    </Link>
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {isAuthenticated && userApplication && (
                          <MyApplicationCard
                            application={userApplication}
                            isFinancialNeed={isFinancialNeed}
                            isMaterialNeed={isMaterialNeed}
                            usesManualMarkDone={usesManualMarkDone}
                            actions={volunteer}
                          />
                        )}

                        {isAuthenticated && effectiveUserType === 'individual' && !userApplication && user && user.verification_status === 'verified' && (
                          <ApplyForm
                            isFinancialNeed={isFinancialNeed}
                            isSkillServiceNeed={isSkillServiceNeed}
                            verificationRequired={user.verification_status !== 'verified'}
                            actions={volunteer}
                          />
                        )}
                      </>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
