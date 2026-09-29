// API endpoint for NGO verification (manual document-first flow)
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { getTokenClaims, requireBankStatementDocument } from '@/lib/auth';
import {
  initiateNgoVerification,
  reverifyNgoVerification,
  type NgoVerificationSubmission,
} from '@/lib/ngo-verification/submission';
import { getNgoVerificationStatus } from '@/lib/ngo-verification/status';
import { untrustedDocumentResponse } from '@/lib/ca-review/document-urls';

export async function POST(req: NextRequest) {
  try {
    const claims = getTokenClaims(req);
    if (!claims) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = claims.id;

    if (!userId) {
      return NextResponse.json({ error: 'Invalid token: missing user ID' }, { status: 401 });
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('user_type')
      .eq('id', userId)
      .single();

    if (userError || !user || user.user_type !== 'ngo') {
      return NextResponse.json({ error: 'Only NGOs can use this verification method' }, { status: 403 });
    }

    const {
      action,
      organizationName,
      panNumber,
      registrationNumber,
      registrationType,
      documents,
      complianceDocuments,
      complianceNumbers,
      fcraNumber,
      fcraExpiryDate,
      twelveAExpiryDate,
      eightyGExpiryDate,
      csr1ExpiryDate,
    } = await req.json();

    const submission: NgoVerificationSubmission = {
      organizationName,
      registrationNumber,
      registrationType,
      documents,
      complianceDocuments,
      complianceNumbers,
      panNumber,
      fcraNumber,
      fcraExpiryDate,
      twelveAExpiryDate,
      eightyGExpiryDate,
      csr1ExpiryDate,
    };

    switch (action) {
      case 'initiate': {
        const bankStatementError = requireBankStatementDocument(documents);
        if (bankStatementError) return bankStatementError;
        const documentError = untrustedDocumentResponse(userId, documents, complianceDocuments);
        if (documentError) return documentError;
        return await initiateNgoVerification(userId, submission);
      }

      case 'reverify': {
        const bankStatementError = requireBankStatementDocument(documents);
        if (bankStatementError) return bankStatementError;
        const documentError = untrustedDocumentResponse(userId, documents, complianceDocuments);
        if (documentError) return documentError;
        return await reverifyNgoVerification(userId, submission);
      }
      
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('NGO verification error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const claims = getTokenClaims(req);
    if (!claims) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = claims.id;

    if (!userId) {
      return NextResponse.json({ error: 'Invalid token: missing user ID' }, { status: 401 });
    }

    return NextResponse.json(await getNgoVerificationStatus(userId));
  } catch (error) {
    console.error('Get NGO verification status error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
