import { NextRequest, NextResponse } from 'next/server';
import { db, supabase } from '@/lib/db';
import { withAuth, UserData, backfillNgoComplianceProfileData, backfillNgoDocumentExpiries, summarizeDocumentExpiries, ngoIsCsrEligible, getCaComplianceTags, getAccountAccessBlockReason } from '@/lib/auth';
import { applyCaBadgeToProfile } from '@/lib/platform-ca-auth';

async function handler(req: NextRequest) {
  try {
    // The user is attached by the withAuth middleware
    const user = (req as any).user as UserData;
    
    // Fetch fresh user data from database including profile_image
    const freshUserData = await db.users.findById(user.id);
    
    if (!freshUserData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if the account is banned or suspended — force logout if so.
    const accessBlock = getAccountAccessBlockReason({
      account_status: freshUserData.account_status,
      locked_until: freshUserData.locked_until,
      profile_data: freshUserData.profile_data,
    });
    if (accessBlock) {
      return NextResponse.json({ error: accessBlock }, { status: 403 });
    }

    // Get verification status based on user type - check database only.
    // users.verification_status is the admin's authoritative override:
    //   - 'verified'    → trust users table (CA has approved)
    //   - 'unverified' / 'suspended' / 'pending' → admin explicitly downgraded; do NOT
    //     let the type-specific verification table override it.
    //   - null / missing → fall back to the verification table (legacy rows).
    const adminStatus = String(freshUserData.verification_status || '').trim().toLowerCase();
    const adminOverrides = adminStatus === 'unverified' || adminStatus === 'suspended' || adminStatus === 'pending';
    let verificationStatus: string = adminStatus || 'unverified';
    let verificationDetails = null;

    if (!adminOverrides) {
      if (freshUserData.user_type === 'individual') {
        const { data: verification } = await supabase
          .from('individual_verifications')
          .select('verification_status, aadhaar_verified, pan_verified, verification_date, aadhaar_number, pan_number, aadhaar_verification_date, pan_verification_date')
          .eq('user_id', user.id)
          .single();
        if (verification) {
          verificationStatus = freshUserData.verification_status === 'verified'
            ? 'verified'
            : verification.verification_status;
          verificationDetails = verification;
        }
      } else if (freshUserData.user_type === 'company') {
        const { data: verification } = await supabase
          .from('company_verifications')
          .select('verification_status, company_name, verification_date, registration_number, gst_number')
          .eq('user_id', user.id)
          .single();
        if (verification) {
          verificationStatus = freshUserData.verification_status === 'verified'
            ? 'verified'
            : verification.verification_status;
          verificationDetails = verification;
        }
      } else if (freshUserData.user_type === 'ngo') {
        const { data: verification } = await supabase
          .from('ngo_verifications')
          .select('verification_status, ngo_name, verification_date, registration_number, registration_type, fcra_number')
          .eq('user_id', user.id)
          .single();
        if (verification) {
          verificationStatus = freshUserData.verification_status === 'verified'
            ? 'verified'
            : verification.verification_status;
          verificationDetails = verification;
        }
      }
    }

    let profileData = (freshUserData.profile_data && typeof freshUserData.profile_data === 'object')
      ? freshUserData.profile_data as Record<string, unknown>
      : {};

    if (freshUserData.user_type === 'ngo') {
      const backfill = backfillNgoComplianceProfileData(profileData);
      profileData = backfill.profileData;
      const expiryBackfill = backfillNgoDocumentExpiries(profileData);
      profileData = expiryBackfill.profileData;

      if (backfill.changed || expiryBackfill.changed) {
        await supabase
          .from('users')
          .update({ profile_data: profileData })
          .eq('id', user.id);
        freshUserData.profile_data = profileData;
      }
    }

    let caBadgeNumber: string | null = null;
    if (verificationStatus === 'verified') {
      const attached = applyCaBadgeToProfile(profileData, user.id);
      profileData = attached.profileData;
      caBadgeNumber = attached.badge;
      if (attached.changed) {
        await supabase
          .from('users')
          .update({ profile_data: profileData })
          .eq('id', user.id);
        freshUserData.profile_data = profileData;
      }
    }
    
    return NextResponse.json({
      user: {
        id: freshUserData.id,
        email: freshUserData.email,
        name: freshUserData.name,
        user_type: freshUserData.user_type,
        phone: freshUserData.phone || '',
        bio: freshUserData.bio || '',
        email_verified: freshUserData.email_verified || false,
        phone_verified: freshUserData.phone_verified || false,
        email_verified_at: freshUserData.email_verified_at,
        phone_verified_at: freshUserData.phone_verified_at,
        verification_status: verificationStatus,
        ca_badge_number: caBadgeNumber,
        csr_eligible:
          freshUserData.user_type === 'ngo'
            ? ngoIsCsrEligible(verificationStatus, profileData)
            : false,
        ca_compliance_tags:
          freshUserData.user_type === 'ngo' ? getCaComplianceTags(profileData, verificationStatus) : [],
        reverification_pending: Boolean(profileData.reverification_pending),
        document_expiry_summary:
          freshUserData.user_type === 'ngo' ? summarizeDocumentExpiries(profileData) : null,
        verification_details: verificationDetails,
        profile_image: freshUserData.profile_image || null,
        cover_image: typeof profileData.cover_image === 'string' ? profileData.cover_image : null,
        city: freshUserData.city,
        state_province: freshUserData.state_province,
        pincode: freshUserData.pincode,
        country: freshUserData.country,
        location: freshUserData.location || '',
        ngo_volunteer_capacity: freshUserData.ngo_volunteer_capacity ?? null,
        created_at: freshUserData.created_at,
        profile_data: profileData,
        // For backward compatibility, also extract profile fields
        profile: profileData
      }
    });
    
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return NextResponse.json({ error: 'Failed to fetch user profile' }, { status: 500 });
  }
}

// Apply authentication middleware
export const GET = withAuth(handler);