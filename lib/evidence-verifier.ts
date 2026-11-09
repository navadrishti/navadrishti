/**
 * Evidence Verifier domain helpers.
 *
 * Evidence Verifier is the current product name for the role previously called Company CA.
 * Database tables and some JWT/payment enums still use `company_ca_*` / `company_ca` for
 * backward compatibility.
 */
export * from '@/lib/company-ca'

export {
  CompanyCaAssignmentError as EvidenceVerifierAssignmentError,
  isProjectEligibleForCompanyCaAssignment as isProjectEligibleForEvidenceVerifierAssignment,
  findCompanyCaIdentityForCompany as findEvidenceVerifierIdentityForCompany,
  findActiveCompanyCaIdentityById as findActiveEvidenceVerifierIdentityById,
  assignCompanyCaToProject as assignEvidenceVerifierToProject,
  setCompanyCaAssignmentStatus as setEvidenceVerifierAssignmentStatus,
  listActiveAssignedProjectIdsForCompanyCa as listActiveAssignedProjectIdsForEvidenceVerifier,
  isCompanyCaAssignedToProject as isEvidenceVerifierAssignedToProject,
  assertCompanyCaAssignedToProject as assertEvidenceVerifierAssignedToProject,
  getCompanyCAUserIdSet as getEvidenceVerifierUserIdSet,
  isCompanyCAUser as isEvidenceVerifierUser,
  generateUniqueCompanyCaId as generateUniqueEvidenceVerifierCaId,
  ensureCompanyCaIdAssigned as ensureEvidenceVerifierCaIdAssigned,
  getCompanyCaIdSuccessionOptions as getEvidenceVerifierIdSuccessionOptions,
  isCompanyCaIdRegisteredForCompany as isEvidenceVerifierCaIdRegisteredForCompany,
  isCompanyCaIdReusableForSuccession as isEvidenceVerifierCaIdReusableForSuccession,
  resetCompanyCaPassword as resetEvidenceVerifierPassword,
  type CompanyCaIdSuccessionOption as EvidenceVerifierIdSuccessionOption,
  type CompanyCaProjectAssignment as EvidenceVerifierProjectAssignment,
} from '@/lib/company-ca'
