import { NextRequest } from 'next/server';
import { getCAFromRequest } from '@/lib/server-ca-auth';
import { getCompanyCAFromRequest } from '@/lib/server-company-ca-auth';

export interface EvidenceApproverContext {
  actorType: 'platform_ca' | 'company_ca';
  reviewerUserId: number | null;
  companyUserId: number | null;
  companyCAIdentityId: string | null;
}

export async function getEvidenceApproverContext(
  request: NextRequest,
  expectedCompanyUserId?: number
): Promise<EvidenceApproverContext> {
  try {
    getCAFromRequest(request);
    return {
      actorType: 'platform_ca',
      reviewerUserId: null,
      companyUserId: null,
      companyCAIdentityId: null
    };
  } catch {
    // Continue to company CA fallback.
  }

  const companyCA = await getCompanyCAFromRequest(request);

  if (
    expectedCompanyUserId !== undefined &&
    companyCA.identity.company_user_id !== expectedCompanyUserId
  ) {
    throw new Error('Company CA is not authorized for this company project');
  }

  return {
    actorType: 'company_ca',
    reviewerUserId: companyCA.user.id,
    companyUserId: companyCA.identity.company_user_id,
    companyCAIdentityId: companyCA.identity.id
  };
}
