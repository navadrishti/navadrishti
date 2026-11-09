import { AuthError, hashPassword, type UserData } from '@/lib/auth';
import { supabase } from '@/lib/db';

export type CompanyCaIdSuccessionOption = {
  ca_id: string;
  holder_name: string | null;
  holder_status: string | null;
  reusable: boolean;
};

export type CompanyCaProjectAssignment = {
  id: string;
  company_ca_identity_id: string;
  company_ca_user_id: number;
  company_user_id: number;
  project_id: string;
  status: string;
  assigned_by: number | null;
  assigned_at: string;
  deactivated_at: string | null;
  created_at: string;
  updated_at: string;
};

export class CompanyCaAssignmentError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'CompanyCaAssignmentError';
    this.status = status;
  }
}

const CA_ASSIGNABLE_PROJECT_STATUSES = [
  'planning',
  'active',
  'on-hold',
  'in_progress',
  'submitted',
] as const;

const CA_HISTORY_PROJECT_STATUSES = new Set([
  'completed',
  'closed',
  'finished',
  'done',
  'cancelled',
  'canceled',
  'rejected',
  'expired',
  'ended',
]);

export function isProjectEligibleForCompanyCaAssignment(projectStatus: unknown): boolean {
  const status = String(projectStatus || '')
    .trim()
    .toLowerCase();
  if (!status) return false;
  if (CA_HISTORY_PROJECT_STATUSES.has(status)) return false;
  return (CA_ASSIGNABLE_PROJECT_STATUSES as readonly string[]).includes(status);
}

function mapCaAssignment(row: Record<string, unknown>): CompanyCaProjectAssignment {
  return {
    id: String(row.id),
    company_ca_identity_id: String(row.company_ca_identity_id),
    company_ca_user_id: Number(row.company_ca_user_id),
    company_user_id: Number(row.company_user_id),
    project_id: String(row.project_id),
    status: String(row.status || 'inactive'),
    assigned_by: row.assigned_by == null ? null : Number(row.assigned_by),
    assigned_at: String(row.assigned_at || ''),
    deactivated_at: row.deactivated_at == null ? null : String(row.deactivated_at),
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  };
}

function hasEvidenceReviewPermission(permissions: unknown): boolean {
  if (typeof permissions !== 'object' || permissions === null || Array.isArray(permissions)) {
    return false;
  }
  return 'can_review_evidence' in permissions && permissions.can_review_evidence === true;
}

function assertEvidenceVerifierCanReview(identity: {
  status: string;
  permissions: unknown;
}): void {
  if (identity.status !== 'active') {
    throw new CompanyCaAssignmentError(
      'Only active Evidence Verifiers can be assigned to projects',
      409
    );
  }
  if (!hasEvidenceReviewPermission(identity.permissions)) {
    throw new CompanyCaAssignmentError(
      'Evidence Verifier must have permission to review evidence',
      409
    );
  }
}

async function isCompanyEmployeeUserId(userId: number): Promise<boolean> {
  const { data, error } = await supabase
    .from('company_employee_identities')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

/** Company owner managing Evidence Verifiers — not an employee or CA identity. */
export async function assertVerifiedCompanyEvidenceVerifierManager(user: UserData): Promise<void> {
  if (user.user_type !== 'company') {
    throw new AuthError('Insufficient permissions', 403);
  }
  if (await isCompanyCAUser(user.id)) {
    throw new AuthError('Evidence Verifier accounts cannot manage team members', 403);
  }
  if (await isCompanyEmployeeUserId(user.id)) {
    throw new AuthError('Employee accounts cannot manage team members', 403);
  }
  if (String(user.verification_status || '').toLowerCase() === 'verified') {
    return;
  }
  throw new AuthError('Verified Company account required to manage Evidence Verifiers', 403);
}

export async function findCompanyCaIdentityForCompany(
  identityId: string,
  companyUserId: number
): Promise<{
  id: string;
  user_id: number;
  company_user_id: number;
  status: string;
  permissions: unknown;
} | null> {
  const { data, error } = await supabase
    .from('company_ca_identities')
    .select('id, user_id, company_user_id, status, permissions')
    .eq('id', identityId)
    .eq('company_user_id', companyUserId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: String(data.id),
    user_id: Number(data.user_id),
    company_user_id: Number(data.company_user_id),
    status: String(data.status || ''),
    permissions: data.permissions,
  };
}

export async function findActiveCompanyCaIdentityById(
  identityId: string,
  companyUserId: number
): Promise<{
  id: string;
  user_id: number;
  company_user_id: number;
  status: string;
  permissions: unknown;
} | null> {
  const identity = await findCompanyCaIdentityForCompany(identityId, companyUserId);
  if (!identity || identity.status !== 'active') return null;
  return identity;
}

async function findOwnedCsrProjectForCompany(
  projectId: string,
  companyUserId: number
): Promise<{ id: string; title: string; project_status: string; company_user_id: number } | null> {
  const { data, error } = await supabase
    .from('csr_projects')
    .select('id, title, project_status, company_user_id')
    .eq('id', projectId)
    .eq('company_user_id', companyUserId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: String(data.id),
    title: String(data.title || ''),
    project_status: String(data.project_status || ''),
    company_user_id: Number(data.company_user_id),
  };
}

export async function assignCompanyCaToProject(input: {
  companyUserId: number;
  actorUserId: number;
  identityId: string;
  projectId: string;
}): Promise<{ assignment: CompanyCaProjectAssignment; created: boolean }> {
  const identity = await findCompanyCaIdentityForCompany(input.identityId, input.companyUserId);
  if (!identity) throw new CompanyCaAssignmentError('Evidence Verifier not found', 404);
  assertEvidenceVerifierCanReview(identity);

  const project = await findOwnedCsrProjectForCompany(input.projectId, input.companyUserId);
  if (!project) throw new CompanyCaAssignmentError('Project not found', 404);
  if (!isProjectEligibleForCompanyCaAssignment(project.project_status)) {
    throw new CompanyCaAssignmentError('This project is not eligible for Evidence Verifier assignment', 409);
  }

  const { data: existing, error: existingError } = await supabase
    .from('company_ca_project_assignments')
    .select('*')
    .eq('company_ca_identity_id', identity.id)
    .eq('project_id', project.id)
    .eq('company_user_id', input.companyUserId)
    .maybeSingle();
  if (existingError) throw existingError;

  const now = new Date().toISOString();
  if (existing) {
    if (String(existing.status).toLowerCase() === 'active') {
      throw new CompanyCaAssignmentError('Project is already assigned to this Evidence Verifier', 409);
    }
    const { data: reactivated, error } = await supabase
      .from('company_ca_project_assignments')
      .update({
        status: 'active',
        deactivated_at: null,
        assigned_by: input.actorUserId,
        assigned_at: now,
        updated_at: now,
      })
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error || !reactivated) {
      throw new CompanyCaAssignmentError('Failed to assign project', 500);
    }
    return { assignment: mapCaAssignment(reactivated as Record<string, unknown>), created: false };
  }

  const { data: created, error: createError } = await supabase
    .from('company_ca_project_assignments')
    .insert({
      company_ca_identity_id: identity.id,
      company_ca_user_id: identity.user_id,
      company_user_id: input.companyUserId,
      project_id: project.id,
      status: 'active',
      assigned_by: input.actorUserId,
      assigned_at: now,
    })
    .select('*')
    .single();
  if (createError || !created) {
    throw new CompanyCaAssignmentError('Failed to assign project', 500);
  }
  return { assignment: mapCaAssignment(created as Record<string, unknown>), created: true };
}

export async function setCompanyCaAssignmentStatus(input: {
  companyUserId: number;
  identityId: string;
  assignmentId: string;
  status: 'active' | 'inactive';
  actorUserId: number;
}) {
  const identity = await findCompanyCaIdentityForCompany(input.identityId, input.companyUserId);
  if (!identity) throw new CompanyCaAssignmentError('Evidence Verifier not found', 404);

  const { data: existing, error: existingError } = await supabase
    .from('company_ca_project_assignments')
    .select('*')
    .eq('id', input.assignmentId)
    .eq('company_ca_identity_id', identity.id)
    .eq('company_user_id', input.companyUserId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing) throw new CompanyCaAssignmentError('Assignment not found', 404);

  if (input.status === 'active') {
    const project = await findOwnedCsrProjectForCompany(String(existing.project_id), input.companyUserId);
    if (!project || !isProjectEligibleForCompanyCaAssignment(project.project_status)) {
      throw new CompanyCaAssignmentError('This project is not eligible for Evidence Verifier assignment', 409);
    }
    assertEvidenceVerifierCanReview(identity);
  }

  const now = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from('company_ca_project_assignments')
    .update({
      status: input.status,
      deactivated_at: input.status === 'inactive' ? now : null,
      updated_at: now,
    })
    .eq('id', input.assignmentId)
    .eq('company_ca_identity_id', identity.id)
    .eq('company_user_id', input.companyUserId)
    .select('*')
    .single();
  if (error || !updated) throw new CompanyCaAssignmentError('Failed to update assignment', 500);
  return mapCaAssignment(updated as Record<string, unknown>);
}

export async function listActiveAssignedProjectIdsForCompanyCa(
  companyCaUserId: number
): Promise<string[]> {
  const { data, error } = await supabase
    .from('company_ca_project_assignments')
    .select('project_id')
    .eq('company_ca_user_id', companyCaUserId)
    .eq('status', 'active');
  if (error) throw error;
  return (data ?? []).map((row) => String(row.project_id));
}

export async function isCompanyCaAssignedToProject(input: {
  companyCaUserId: number;
  companyUserId: number;
  projectId: string;
}): Promise<boolean> {
  const { data, error } = await supabase
    .from('company_ca_project_assignments')
    .select('id, company_user_id')
    .eq('company_ca_user_id', input.companyCaUserId)
    .eq('project_id', input.projectId)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw error;
  if (!data) return false;
  return Number(data.company_user_id) === input.companyUserId;
}

export async function assertCompanyCaAssignedToProject(input: {
  companyCaUserId: number;
  companyUserId: number;
  projectId: string;
}): Promise<void> {
  const ok = await isCompanyCaAssignedToProject(input);
  if (!ok) {
    throw new CompanyCaAssignmentError('Project not assigned to this Evidence Verifier', 403);
  }
}

/** Guard for EvidenceApproverContext-style company CA actors. */
export async function assertEvidenceApproverAssignedToProject(input: {
  actorType: 'platform_ca' | 'company_ca';
  reviewerUserId: number | null;
  companyUserId: number | null;
  projectCompanyUserId: number;
  projectId: string;
}): Promise<void> {
  if (input.actorType !== 'company_ca' || input.companyUserId == null) return;
  if (input.companyUserId !== input.projectCompanyUserId) {
    throw new CompanyCaAssignmentError(
      'Evidence Verifier is not authorized for this company project',
      403
    );
  }
  if (input.reviewerUserId == null) {
    throw new CompanyCaAssignmentError('Evidence Verifier session is incomplete', 403);
  }
  await assertCompanyCaAssignedToProject({
    companyCaUserId: input.reviewerUserId,
    companyUserId: input.companyUserId,
    projectId: input.projectId,
  });
}

export async function getCompanyCAUserIdSet(candidateUserIds?: number[]): Promise<Set<number>> {
  let query = supabase.from('company_ca_identities').select('user_id');

  if (candidateUserIds && candidateUserIds.length > 0) {
    query = query.in('user_id', candidateUserIds);
  }

  const { data, error } = await query;
  if (error) throw error;

  return new Set((data ?? []).map((row) => Number(row.user_id)));
}

export async function isCompanyCAUser(userId: number): Promise<boolean> {
  const { data, error } = await supabase
    .from('company_ca_identities')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

export async function generateUniqueCompanyCaId(companyUserId: number): Promise<string> {
  const { data: existingIds, error } = await supabase
    .from('company_ca_identities')
    .select('ca_id')
    .eq('company_user_id', companyUserId)
    .not('ca_id', 'is', null);

  if (error) {
    throw new Error(`Failed to fetch existing CA IDs: ${error.message}`);
  }

  const prefix = `CAID-${companyUserId}-`;
  const used = new Set<string>();
  let maxSequence = 0;

  for (const row of existingIds ?? []) {
    const caId = String(row.ca_id ?? '').trim();
    if (!caId) continue;

    used.add(caId);

    if (!caId.startsWith(prefix)) continue;

    const sequence = Number.parseInt(caId.slice(prefix.length), 10);
    if (Number.isFinite(sequence) && sequence > maxSequence) {
      maxSequence = sequence;
    }
  }

  let nextSequence = maxSequence + 1;
  let candidate = `${prefix}${String(nextSequence).padStart(3, '0')}`;

  while (used.has(candidate)) {
    nextSequence += 1;
    candidate = `${prefix}${String(nextSequence).padStart(3, '0')}`;
  }

  return candidate;
}

export async function ensureCompanyCaIdAssigned(
  identityId: string,
  companyUserId: number,
  currentCaId?: string | null
): Promise<string> {
  const existing = String(currentCaId ?? '').trim();
  if (existing) return existing;

  const newCaId = await generateUniqueCompanyCaId(companyUserId);
  const { error } = await supabase
    .from('company_ca_identities')
    .update({ ca_id: newCaId, updated_at: new Date().toISOString() })
    .eq('id', identityId)
    .is('ca_id', null);

  if (error) {
    throw new Error(`Failed to assign CA ID: ${error.message}`);
  }

  const { data, error: readError } = await supabase
    .from('company_ca_identities')
    .select('ca_id')
    .eq('id', identityId)
    .single();

  if (readError) {
    throw new Error(`Failed to read assigned CA ID: ${readError.message}`);
  }

  return String(data?.ca_id ?? newCaId).trim();
}

export async function getCompanyCaIdSuccessionOptions(
  companyUserId: number
): Promise<CompanyCaIdSuccessionOption[]> {
  const { data, error } = await supabase
    .from('company_ca_identities')
    .select('ca_id, status, users:user_id(name)')
    .eq('company_user_id', companyUserId)
    .not('ca_id', 'is', null)
    .order('ca_id', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch available CA IDs: ${error.message}`);
  }

  const byCaId = new Map<string, CompanyCaIdSuccessionOption>();

  for (const row of data ?? []) {
    const ca_id = String(row.ca_id ?? '').trim();
    if (!ca_id) continue;

    const holderName = (row as { users?: { name?: string | null } | null }).users?.name ?? null;
    const status = row.status ?? null;
    const existing = byCaId.get(ca_id);

    if (!existing) {
      byCaId.set(ca_id, {
        ca_id,
        holder_name: holderName,
        holder_status: status,
        reusable: status !== 'active',
      });
      continue;
    }

    if (status === 'active') {
      existing.holder_name = holderName;
      existing.holder_status = status;
      existing.reusable = false;
    }
  }

  return Array.from(byCaId.values());
}

export async function isCompanyCaIdRegisteredForCompany(
  companyUserId: number,
  caId: string
): Promise<boolean> {
  const normalizedCaId = caId.trim();
  if (!normalizedCaId) return false;

  const { data, error } = await supabase
    .from('company_ca_identities')
    .select('id')
    .eq('company_user_id', companyUserId)
    .eq('ca_id', normalizedCaId)
    .limit(1);

  if (error) {
    throw new Error(`Failed to check CA ID registration: ${error.message}`);
  }

  return (data?.length ?? 0) > 0;
}

export async function isCompanyCaIdReusableForSuccession(
  companyUserId: number,
  caId: string
): Promise<boolean> {
  if (!(await isCompanyCaIdRegisteredForCompany(companyUserId, caId))) {
    return false;
  }

  const { data, error } = await supabase
    .from('company_ca_identities')
    .select('id')
    .eq('company_user_id', companyUserId)
    .eq('ca_id', caId.trim())
    .eq('status', 'active')
    .limit(1);

  if (error) {
    throw new Error(`Failed to check CA ID reuse eligibility: ${error.message}`);
  }

  return (data?.length ?? 0) === 0;
}

export async function resetCompanyCaPassword(input: {
  identityId: string;
  companyUserId: number;
  password: string;
}) {
  const { identityId, companyUserId, password } = input;
  const passwordHash = await hashPassword(password);

  const { data: existing, error: findError } = await supabase
    .from('company_ca_identities')
    .select('*')
    .eq('id', identityId)
    .eq('company_user_id', companyUserId)
    .single();

  if (findError || !existing) {
    throw new Error('CA identity not found');
  }

  const { error: userUpdateError } = await supabase
    .from('users')
    .update({ password: passwordHash, updated_at: new Date().toISOString() })
    .eq('id', existing.user_id);

  if (userUpdateError) {
    throw new Error('Failed to reset CA password');
  }

  const { data: updated, error: identityUpdateError } = await supabase
    .from('company_ca_identities')
    .update({
      must_change_password: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', identityId)
    .eq('company_user_id', companyUserId)
    .select('*')
    .single();

  if (identityUpdateError) {
    throw new Error('Failed to reset CA password');
  }

  await supabase.from('csr_audit_log').insert({
    entity_type: 'company_ca_identity',
    entity_id: identityId,
    event_type: 'company_ca_password_reset',
    event_hash: `company_ca_password_reset:${identityId}:${Date.now()}`,
    event_payload: {
      company_user_id: companyUserId,
      company_ca_user_id: existing.user_id,
      reset_by_company: true,
    },
    created_by: companyUserId,
  });

  return updated;
}
