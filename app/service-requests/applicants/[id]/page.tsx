'use client'

import { use } from 'react'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, Loader2, Users, CheckCircle, Clock } from 'lucide-react'
import { isDeliverableNeed } from './helpers'
import type { Volunteer } from './types'
import { useApplicants } from './use-applicants'
import { NeedDetailsCard } from './need-details-card'
import {
  AcceptedVolunteerCard,
  ActiveVolunteerCard,
  CompletedVolunteerCard,
  EmptyTabCard,
  PendingVolunteerCard,
} from './volunteer-card'

export default function ServiceRequestApplicantsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const { router, loading, request, volunteers, updating, handleVolunteerStatusUpdate } = useApplicants(resolvedParams.id);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Need Not Found</h1>
            <Button onClick={() => router.back()} className="hover:bg-transparent active:bg-transparent focus-visible:bg-transparent focus-visible:ring-0">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const pendingVolunteers = volunteers.filter((v) => v.status === 'pending');
  const acceptedVolunteers = volunteers.filter((v) => v.status === 'accepted');
  const activeVolunteers = volunteers.filter((v) => v.status === 'active');
  const completedVolunteers = volunteers.filter((v) => v.status === 'completed');
  const deliverableNeed = isDeliverableNeed(request);

  const cardProps = (volunteer: Volunteer) => ({
    request,
    volunteer,
    deliverableNeed,
    busy: updating === volunteer.id,
    onStatusChange: handleVolunteerStatusUpdate,
  });

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Button variant="ghost" onClick={() => router.back()} className="px-0 text-udaan-blue hover:text-gram-ink hover:bg-transparent active:bg-transparent focus-visible:bg-transparent focus-visible:ring-0">
            <ArrowLeft size={20} className="mr-2" />
            Back
          </Button>
        </div>

        <NeedDetailsCard request={request} applicantCount={volunteers.length} deliverableNeed={deliverableNeed} />

        <Tabs defaultValue="pending" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="pending" className="relative">
              Pending {pendingVolunteers.length > 0 && (
                <Badge className="ml-2 bg-yellow-500 text-white text-xs">{pendingVolunteers.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="accepted">
              Accepted {acceptedVolunteers.length > 0 && (
                <Badge className="ml-2 bg-green-500 text-white text-xs">{acceptedVolunteers.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="active">
              Active {activeVolunteers.length > 0 && (
                <Badge className="ml-2 bg-blue-500 text-white text-xs">{activeVolunteers.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="completed">
              Completed {completedVolunteers.length > 0 && (
                <Badge className="ml-2 bg-gray-500 text-white text-xs">{completedVolunteers.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending">
            <div className="space-y-4">
              {pendingVolunteers.length === 0 ? (
                <EmptyTabCard icon={Clock} message="No pending applications" />
              ) : (
                pendingVolunteers.map((volunteer) => (
                  <PendingVolunteerCard key={volunteer.id} {...cardProps(volunteer)} />
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="accepted">
            <div className="space-y-4">
              {acceptedVolunteers.length === 0 ? (
                <EmptyTabCard icon={CheckCircle} message="No accepted volunteers" />
              ) : (
                acceptedVolunteers.map((volunteer) => (
                  <AcceptedVolunteerCard key={volunteer.id} {...cardProps(volunteer)} />
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="active">
            <div className="space-y-4">
              {activeVolunteers.length === 0 ? (
                <EmptyTabCard icon={Users} message="No active volunteers" />
              ) : (
                activeVolunteers.map((volunteer) => (
                  <ActiveVolunteerCard key={volunteer.id} {...cardProps(volunteer)} />
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="completed">
            <div className="space-y-4">
              {completedVolunteers.length === 0 ? (
                <EmptyTabCard icon={CheckCircle} message="No completed volunteers" />
              ) : (
                completedVolunteers.map((volunteer) => (
                  <CompletedVolunteerCard key={volunteer.id} volunteer={volunteer} />
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
