import { NextRequest, NextResponse } from 'next/server';
import {
  getTokenClaims,
  isCaVerifiedAccount,
  CA_VERIFICATION_REQUIRED_TO_PAY_MESSAGE,
} from '@/lib/auth';
import { CSR_SCHEDULE_VII_CATEGORIES } from '@/lib/categories';
import { rankRecommendedNgosForViewer } from '@/lib/csr-agent/recommendation-utils';
import {
  assertNgoLiveCsr1,
  CSR_PAYMENT_REQUIRES_LIVE_CSR1_MESSAGE,
  resolveEffectiveVerificationStatus,
} from '@/lib/server-auth';
import {
  canContributeViaPlatform,
  isVerifiedNgoUser,
  ngoIsEligibleForNetworkListing,
  PayeeNotConnectedError,
} from '@/lib/razorpay-route';
import Razorpay from 'razorpay';
import { filterNetworkNgos, loadNetworkNgos, loadRecommendationViewer } from '@/lib/ngo-network/listing';
import { createNetworkDonationOrder, verifyNetworkDonation } from '@/lib/ngo-network/donation';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const verifiedOnly = searchParams.get('verified_only') !== 'false';
    const recommendMode = ['1', 'true', 'yes'].includes(
      String(searchParams.get('recommend') || '').trim().toLowerCase()
    );
    const shuffleTies = !['0', 'false', 'no'].includes(
      String(searchParams.get('shuffle') || '1').trim().toLowerCase()
    );

    const viewer = recommendMode ? await loadRecommendationViewer(request) : null;

    const ngos = await loadNetworkNgos(verifiedOnly);
    if (!ngos) {
      return Response.json({ success: false, error: 'Failed to fetch NGO network' }, { status: 500 });
    }

    if (recommendMode) {
      if (!viewer) {
        return Response.json({
          success: true,
          recommended: [],
          ngos: [],
          sectors: CSR_SCHEDULE_VII_CATEGORIES,
          total: 0,
        });
      }

      const recommendCatalog = verifiedOnly
        ? ngos.filter((ngo) => ngo.compliance.verified)
        : ngos;

      const recommended = rankRecommendedNgosForViewer(recommendCatalog, viewer, {
        poolSize: 6,
        displaySize: 4,
        shuffleTies,
      }).map(({ search_haystack: _haystack, city: _city, state_province: _state, match_score: _score, ...ngo }) => ngo);

      return Response.json({
        success: true,
        recommended,
        ngos: [],
        sectors: CSR_SCHEDULE_VII_CATEGORIES,
        total: recommended.length,
      });
    }

    const payload = filterNetworkNgos(ngos, {
      search: (searchParams.get('search') || '').trim(),
      location: (searchParams.get('location') || '').trim(),
      sector: (searchParams.get('sector') || '').trim(),
      compliance: searchParams.get('compliance') || '',
      registrationType: (searchParams.get('registration_type') || '').trim(),
      verifiedOnly,
    });

    return Response.json({
      success: true,
      ngos: payload,
      sectors: CSR_SCHEDULE_VII_CATEGORIES,
      total: payload.length,
    });
  } catch (err) {
    console.error('NGO network error:', err);
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const decoded = getTokenClaims(request);
    if (!decoded) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (!canContributeViaPlatform(decoded.user_type)) {
      return NextResponse.json({ error: 'Only companies and individuals can pay NGOs from the network' }, { status: 403 });
    }

    const effectivePayerVerificationStatus = await resolveEffectiveVerificationStatus(decoded.id, decoded.user_type);
    if (!isCaVerifiedAccount(effectivePayerVerificationStatus)) {
      return NextResponse.json({ error: CA_VERIFICATION_REQUIRED_TO_PAY_MESSAGE }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || 'create-order').toLowerCase();
    const ngoUserId = Number(body?.ngoId || body?.ngo_id || 0);

    if (!Number.isFinite(ngoUserId) || ngoUserId <= 0) {
      return NextResponse.json({ error: 'Invalid NGO id' }, { status: 400 });
    }

    const verifiedNgo = await isVerifiedNgoUser(ngoUserId);
    if (!verifiedNgo.ok) {
      return NextResponse.json({ error: 'This NGO is not available for platform payments' }, { status: 404 });
    }

    const payoutReady = await ngoIsEligibleForNetworkListing(ngoUserId);
    if (!payoutReady) {
      return NextResponse.json(
        { error: 'This NGO has not connected Razorpay payout yet, so payments cannot be accepted' },
        { status: 403 }
      );
    }

    if (decoded.user_type === 'company') {
      const csrGate = await assertNgoLiveCsr1(ngoUserId, CSR_PAYMENT_REQUIRES_LIVE_CSR1_MESSAGE);
      if (!csrGate.ok) {
        return NextResponse.json({ error: csrGate.error }, { status: 403 });
      }
    }

    const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      return NextResponse.json({ error: 'Razorpay is not configured on this environment' }, { status: 500 });
    }

    const context = {
      razorpay: new Razorpay({ key_id: keyId, key_secret: keySecret }),
      keyId,
      keySecret,
      contributor: decoded,
      ngoUserId,
      ngoName: verifiedNgo.name || 'NGO',
    };

    if (action === 'verify') {
      return await verifyNetworkDonation(context, body);
    }

    return await createNetworkDonationOrder(context, body?.amount);
  } catch (error) {
    if (error instanceof PayeeNotConnectedError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('NGO network payment error:', error);
    return NextResponse.json({ error: 'Failed to process NGO network payment' }, { status: 500 });
  }
}
