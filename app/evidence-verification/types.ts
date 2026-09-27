import type { Tables } from '@/lib/database.types';

export type CompanyCAContext = {
  identity_id: string;
  ca_id?: string | null;
  company_user_id: number;
  permissions: Record<string, unknown>;
  user: {
    id: number;
    email: string;
    name: string;
  };
  company?: { name?: string };
  company_name?: string;
};

export type MilestoneEvidence = Tables<'csr_milestone_evidence'> & {
  media: Tables<'csr_milestone_evidence_media'>[];
  documents: Tables<'csr_milestone_evidence_documents'>[];
};

export type MilestoneDetail = Tables<'csr_project_milestones'> & {
  evidence: MilestoneEvidence[];
};
