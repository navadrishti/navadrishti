import { NextRequest, NextResponse } from 'next/server';
import { getNavadrishtCAFromRequest } from '@/lib/navadrishti-ca-auth';
import { supabase } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    // 1️⃣ Verify CA authentication
    const caAccount = await getNavadrishtCAFromRequest(request);

    if (!caAccount) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // 2️⃣ Run all dashboard queries in parallel
    const [
      individualsPendingResult,
      companiesPendingResult,
      ngosPendingResult,

      individualsVerifiedResult,
      companiesVerifiedResult,
      ngosVerifiedResult,

      individualsRejectedResult,
      companiesRejectedResult,
      ngosRejectedResult,
    ] = await Promise.all([

      // =========================
      // PENDING / UNVERIFIED
      // =========================

      supabase
        .from('individual_verifications')
        .select(`
          id,
          user_id,
          verification_status,
          created_at,
          updated_at,
          users (
            id,
            name,
            email,
            profile_image
          )
        `)
        .eq('verification_status', 'unverified')
        .limit(10)
        .order('created_at', { ascending: false }),

      supabase
        .from('company_verifications')
        .select(`
          id,
          user_id,
          verification_status,
          company_name,
          gst_number,
          registration_number,
          created_at,
          updated_at,
          users (
            id,
            name,
            email,
            profile_image
          )
        `)
        .eq('verification_status', 'unverified')
        .limit(10)
        .order('created_at', { ascending: false }),

      supabase
        .from('ngo_verifications')
        .select(`
          id,
          user_id,
          verification_status,
          ngo_name,
          registration_number,
          registration_type,
          fcra_number,
          created_at,
          updated_at,
          users (
            id,
            name,
            email,
            profile_image
          )
        `)
        .eq('verification_status', 'unverified')
        .limit(10)
        .order('created_at', { ascending: false }),

      // =========================
      // VERIFIED COUNTS
      // =========================

      supabase
        .from('individual_verifications')
        .select('*')
        .eq('verification_status', 'verified'),

      supabase
        .from('company_verifications')
        .select('*')
        .eq('verification_status', 'verified'),

      supabase
        .from('ngo_verifications')
        .select('*')
        .eq('verification_status', 'verified'),

      // =========================
      // REJECTED COUNTS
      // =========================

      supabase
        .from('individual_verifications')
        .select('*')
        .eq('verification_status', 'rejected'),

      supabase
        .from('company_verifications')
        .select('*')
        .eq('verification_status', 'rejected'),

      supabase
        .from('ngo_verifications')
        .select('*')
        .eq('verification_status', 'rejected'),
    ]);

    // =========================
    // 3️⃣ HANDLE ERRORS
    // =========================

    if (individualsPendingResult.error) {
      console.error(
        'Individuals query failed:',
        individualsPendingResult.error
      );

      return NextResponse.json(
        { error: 'Failed to fetch individuals' },
        { status: 500 }
      );
    }

    if (companiesPendingResult.error) {
      console.error(
        'Companies query failed:',
        companiesPendingResult.error
      );

      return NextResponse.json(
        { error: 'Failed to fetch companies' },
        { status: 500 }
      );
    }

    if (ngosPendingResult.error) {
      console.error(
        'NGOs query failed:',
        ngosPendingResult.error
      );

      return NextResponse.json(
        { error: 'Failed to fetch NGOs' },
        { status: 500 }
      );
    }

    // =========================
    // 4️⃣ CLEAN RESPONSE SHAPING
    // =========================

    const transformVerification = (item: any) => ({
      verification_id: item.id,
      user_id: item.user_id,

      name: item.users?.name || 'Unknown',
      email: item.users?.email || 'N/A',
      profile_image: item.users?.profile_image || null,

      verification_status: item.verification_status,

      created_at: item.created_at,
      updated_at: item.updated_at,
    });

    const individuals =
      (individualsPendingResult.data || []).map(transformVerification);

    const companies =
      (companiesPendingResult.data || []).map((item: any) => ({
        ...transformVerification(item),

        company_name: item.company_name,
        gst_number: item.gst_number,
        registration_number: item.registration_number,
      }));

    const ngos =
      (ngosPendingResult.data || []).map((item: any) => ({
        ...transformVerification(item),

        ngo_name: item.ngo_name,
        registration_number: item.registration_number,
        registration_type: item.registration_type,
        fcra_number: item.fcra_number,
      }));

    // =========================
    // 5️⃣ RETURN DASHBOARD DATA
    // =========================

    return NextResponse.json({
      success: true,

      ca: {
        id: caAccount.id,
        username: caAccount.username,
        display_name: caAccount.display_name,
      },

      stats: {
        individuals: {
          unverified: individuals.length,
          verified: individualsVerifiedResult.data?.length || 0,
          rejected: individualsRejectedResult.data?.length || 0,
          total:
            individuals.length +
            (individualsVerifiedResult.data?.length || 0) +
            (individualsRejectedResult.data?.length || 0),
        },

        companies: {
          unverified: companies.length,
          verified: companiesVerifiedResult.data?.length || 0,
          rejected: companiesRejectedResult.data?.length || 0,
          total:
            companies.length +
            (companiesVerifiedResult.data?.length || 0) +
            (companiesRejectedResult.data?.length || 0),
        },

        ngos: {
          unverified: ngos.length,
          verified: ngosVerifiedResult.data?.length || 0,
          rejected: ngosRejectedResult.data?.length || 0,
          total:
            ngos.length +
            (ngosVerifiedResult.data?.length || 0) +
            (ngosRejectedResult.data?.length || 0),
        },
      },

      individuals,
      companies,
      ngos,
    });

  } catch (error: any) {
    console.error('CA dashboard error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}