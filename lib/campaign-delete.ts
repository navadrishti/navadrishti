import { supabase } from '@/lib/db';

async function deleteIn(table: string, column: string, ids: string[]) {
  if (ids.length === 0) return;
  const { error } = await supabase.from(table).delete().in(column, ids);
  if (error) throw error;
}

/**
 * Removes a campaign and all linked CSR execution records (projects, milestones,
 * evidence, reviews, payments, etc.) so FK constraints are satisfied.
 */
export async function deleteCampaignWithDependencies(campaignId: string): Promise<void> {
  const { data: projects, error: projectsError } = await supabase
    .from('csr_projects')
    .select('id')
    .eq('campaign_id', campaignId);

  if (projectsError) throw projectsError;

  const projectIds = (projects ?? []).map((row) => String(row.id));

  if (projectIds.length > 0) {
    const { data: milestones, error: milestonesError } = await supabase
      .from('csr_project_milestones')
      .select('id')
      .in('project_id', projectIds);

    if (milestonesError) throw milestonesError;

    const milestoneIds = (milestones ?? []).map((row) => String(row.id));

    let evidenceIds: string[] = [];
    let paymentIds: string[] = [];

    if (milestoneIds.length > 0) {
      const [evidenceResult, paymentsByMilestone] = await Promise.all([
        supabase.from('csr_milestone_evidence').select('id').in('milestone_id', milestoneIds),
        supabase.from('csr_payment_confirmations').select('id').in('milestone_id', milestoneIds),
      ]);

      if (evidenceResult.error) throw evidenceResult.error;
      if (paymentsByMilestone.error) throw paymentsByMilestone.error;

      evidenceIds = (evidenceResult.data ?? []).map((row) => String(row.id));
      paymentIds = (paymentsByMilestone.data ?? []).map((row) => String(row.id));
    }

    const { data: paymentsByProject, error: paymentsByProjectError } = await supabase
      .from('csr_payment_confirmations')
      .select('id')
      .in('project_id', projectIds);

    if (paymentsByProjectError) throw paymentsByProjectError;

    paymentIds = [
      ...new Set([
        ...paymentIds,
        ...(paymentsByProject ?? []).map((row) => String(row.id)),
      ]),
    ];

    await deleteIn('company_ca_action_log', 'payment_confirmation_id', paymentIds);
    await deleteIn('company_ca_action_log', 'milestone_id', milestoneIds);
    await deleteIn('company_ca_action_log', 'project_id', projectIds);

    await deleteIn('csr_milestone_evidence_media', 'evidence_id', evidenceIds);
    await deleteIn('csr_milestone_evidence_documents', 'evidence_id', evidenceIds);
    await deleteIn('csr_milestone_evidence', 'milestone_id', milestoneIds);
    await deleteIn('csr_milestone_evidence', 'project_id', projectIds);
    await deleteIn('csr_milestone_reviews', 'milestone_id', milestoneIds);
    await deleteIn('csr_payment_confirmations', 'milestone_id', milestoneIds);
    await deleteIn('csr_payment_confirmations', 'project_id', projectIds);
    await deleteIn('project_user_assignments', 'project_id', projectIds);
    await deleteIn('csr_impact_metrics', 'project_id', projectIds);
    await deleteIn('csr_project_milestones', 'project_id', projectIds);
    await deleteIn('csr_projects', 'id', projectIds);
  }

  const { error: campaignError } = await supabase.from('campaigns').delete().eq('id', campaignId);
  if (campaignError) throw campaignError;
}

export function formatCampaignDeleteError(error: unknown): string {
  const record = error && typeof error === 'object' ? (error as Record<string, unknown>) : {};
  if (record.code === '23503') {
    return 'This campaign is still linked to other records and could not be deleted.';
  }
  if (typeof record.message === 'string' && record.message.trim()) {
    return record.message;
  }
  return 'Failed to delete campaign';
}
