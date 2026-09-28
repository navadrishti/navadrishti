import 'server-only'
import { serviceRequestApplications } from './db/applications'
import { requestProjects } from './db/request-projects'
import { serviceOffers, serviceClients } from './db/service-offers'
import { serviceRequests, serviceRequestContributions } from './db/service-requests'
import { supportTickets, supportTicketMessages } from './db/support-tickets'
import { users, userAddresses } from './db/users'
import { individualVerifications, verificationDocuments } from './db/verification'

export { supabase, createServerClient } from './db/client'
export {
  type ApiApplication,
  getApplicationApplicantUserId,
  normalizeApplicationApplicantFields,
  shapeApplicationForApi,
  splitApplicationUpdatePayload,
} from './db/applications'
export { buildProjectLeadNgoPatch, getProjectLeadNgoId } from './db/request-projects'
export { applyVolunteerAcceptanceAllocation } from './db/service-requests'
export { type VerificationActorType, type VerificationDocumentRow } from './db/verification'
export {
  archiveAgentSession,
  deleteAgentSessionForUser,
  hardDeleteAgentSession,
  pruneRemovedAgentSessions,
} from './db/ai-agent'
export {
  buildCampaignVolunteerAttendanceSummary,
  ensureCampaignVolunteerAssignment,
  findCampaignVolunteerAssignment,
  listCompanyCampaignVolunteerAttendance,
  processCompletedCampaignVolunteerOutcomes,
} from './db/campaign-volunteers'

export const db = {
  users,
  requestProjects,
  serviceRequests,
  serviceRequestContributions,
  serviceOffers,
  serviceClients,
  individualVerifications,
  verificationDocuments,
  serviceRequestApplications,
  supportTickets,
  supportTicketMessages,
  userAddresses,
};
export default db;
