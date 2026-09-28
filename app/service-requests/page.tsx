'use client'

import { Suspense } from 'react'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { FiltersBar } from './filters-bar'
import { ListingResults } from './listing-results'
import { ServiceRequestsPageSkeleton } from './listing-skeletons'
import { ListingTabs } from './listing-tabs'
import { NgoPostBanner } from './ngo-post-banner'
import { useServiceRequests } from './use-service-requests'

function ServiceRequestsContent() {
  const {
    user,
    isNGO,
    listingKind,
    handleListingChange,
    filters,
    hasActiveFilters,
    clearFilters,
    requests,
    filteredProjects,
    loading,
    error,
    retry,
    currentTime,
    deleting,
    deletingProjectId,
    deleteRequest,
    deleteProject,
  } = useServiceRequests()

  if (error) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 px-6 py-8 md:px-10">
          <div className="py-8 text-center">
            <p className="mb-4 text-red-500">{error}</p>
            <Button onClick={retry}>Try Again</Button>
          </div>
        </main>
      </div>
    )
  }

  const resultCount = listingKind === 'projects' ? filteredProjects.length : requests.length

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 px-6 py-8 md:px-10">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">NGO Requests</h1>
            <p className="text-muted-foreground">
              Browse standalone needs for individuals, or CSR projects for company takeover.
            </p>
          </div>
        </div>

        <ListingTabs listingKind={listingKind} onChange={handleListingChange} />

        {user && isNGO ? <NgoPostBanner listingKind={listingKind} /> : null}

        <FiltersBar
          listingKind={listingKind}
          filters={filters}
          loading={loading}
          resultCount={resultCount}
          hasActiveFilters={hasActiveFilters}
          onClear={clearFilters}
        />

        <div className="min-h-[400px]">
          <ListingResults
            listingKind={listingKind}
            loading={loading}
            requests={requests}
            projects={filteredProjects}
            user={user}
            isNGO={isNGO}
            currentTime={currentTime}
            deletingRequestId={deleting}
            deletingProjectId={deletingProjectId}
            onDeleteRequest={deleteRequest}
            onDeleteProject={deleteProject}
            onClearFilters={clearFilters}
          />
        </div>
      </main>
    </div>
  )
}

export default function ServiceRequestsPage() {
  return (
    <Suspense fallback={<ServiceRequestsPageSkeleton />}>
      <ServiceRequestsContent />
    </Suspense>
  )
}
