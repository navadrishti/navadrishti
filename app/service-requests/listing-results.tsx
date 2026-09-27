'use client'

import Link from 'next/link'
import type { User } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { ServiceCard } from '@/components/service-card'
import { ServiceRequestCardSkeleton } from './listing-skeletons'
import { ProjectListingCard } from './project-listing-card'
import type { ListingKind, ProjectListing, ServiceRequestListing } from './types'

const gridClass = 'grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'

function hasAcceptedApplicant(request: ServiceRequestListing) {
  const count = Number(request?.accepted_volunteers_count ?? request?.volunteers_count ?? 0)
  return Number.isFinite(count) && count > 0
}

export function ListingResults({
  listingKind,
  loading,
  requests,
  projects,
  user,
  isNGO,
  currentTime,
  deletingRequestId,
  deletingProjectId,
  onDeleteRequest,
  onDeleteProject,
  onClearFilters,
}: {
  listingKind: ListingKind
  loading: boolean
  requests: ServiceRequestListing[]
  projects: ProjectListing[]
  user: User | null
  isNGO: boolean
  currentTime: number
  deletingRequestId: number | null
  deletingProjectId: string | null
  onDeleteRequest: (id: number) => void
  onDeleteProject: (id: string) => void
  onClearFilters: () => void
}) {
  if (loading) {
    return (
      <div className={gridClass}>
        {Array.from({ length: 6 }).map((_, i) => (
          <ServiceRequestCardSkeleton key={i} kind={listingKind} />
        ))}
      </div>
    )
  }

  if (listingKind === 'projects') {
    if (projects.length > 0) {
      return (
        <div className={gridClass}>
          {projects.map((project) => (
            <ProjectListingCard
              key={project.id}
              project={project}
              isOwner={Boolean(user && isNGO && Number(user.id) === Number(project.ngo_id))}
              isDeleting={deletingProjectId === String(project.id)}
              onDelete={() => onDeleteProject(String(project.id))}
            />
          ))}
        </div>
      )
    }

    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
        <h3 className="mb-1 text-lg font-semibold">No projects found</h3>
        <p className="mb-4 text-muted-foreground">
          No CSR projects match your current search or filters.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={onClearFilters}>
            Clear Filters
          </Button>
          {isNGO ? (
            <Button asChild>
              <Link href="/service-requests/projects/create">Post a Project</Link>
            </Button>
          ) : null}
        </div>
      </div>
    )
  }

  if (requests.length > 0) {
    return (
      <div className={gridClass}>
        {requests.map((request) => {
          const isOwner = Boolean(user && isNGO && Number(user.id) === Number(request.ngo_id))
          return (
            <ServiceCard
              key={request.id}
              id={request.id}
              title={request.title}
              description={request.description}
              category={request.category}
              location={request.location}
              images={request.images}
              ngo_name={request.ngo_name}
              ngo_id={request.ngo_id}
              provider={request.ngo_name}
              providerType="ngo"
              verified={request.verified}
              tags={request.tags}
              created_at={request.created_at}
              urgency_level={request.urgency_level}
              volunteers_needed={request.volunteers_needed}
              timeline={request.timeline}
              deadline={request.deadline}
              requirements={request.requirements}
              current_amount={request.current_amount}
              impact_score={request.impact_score}
              project={request.project}
              currentTime={currentTime}
              type="request"
              onDelete={() => onDeleteRequest(request.id)}
              isDeleting={deletingRequestId === request.id}
              showDeleteButton={isOwner && !hasAcceptedApplicant(request)}
              isOwner={isOwner}
              canInteract={true}
            />
          )
        })}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
      <h3 className="mb-1 text-lg font-semibold">No needs found</h3>
      <p className="mb-4 text-muted-foreground">
        No NGO needs match your current search or filters.
      </p>
      <Button variant="outline" onClick={onClearFilters}>
        Clear Filters
      </Button>
    </div>
  )
}
