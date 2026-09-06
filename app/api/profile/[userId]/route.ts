import { NextRequest } from 'next/server';
import { supabase } from '@/lib/db';
import {
  COMPLIANCE_DOCUMENT_LABELS,
  backfillNgoComplianceProfileData,
  buildNgoLocationDisplay,
  getComplianceDocumentUrl,
  getNgoFcraDocumentUrl,
  getCoverImageUrl,
  mergeNgoPastProjects,
  getCaComplianceTags,
  ngoIsCsrEligible,
  normalizeExecutionCapacity,
  normalizeGeographicCoverage,
  summarizeGeographicCoverage,
  type ComplianceDocumentKey,
  listDocumentExpiryPublicItems,
  backfillNgoDocumentExpiries,
} from '@/lib/auth';
import { applyCaBadgeToProfile } from '@/lib/platform-ca-auth';
import { isCompanyCAUser } from '@/lib/company-ca';
import { isNgoRazorpayPayoutActive } from '@/lib/razorpay-route';

interface RouteParams {
  params: Promise<{ userId: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await params;
    const parsedUserId = Number.parseInt(userId, 10);

    if (Number.isNaN(parsedUserId)) {
      return Response.json({
        success: false,
        error: 'Profile not found'
      }, { status: 404 });
    }

    if (await isCompanyCAUser(parsedUserId)) {
      return Response.json({
        success: false,
        error: 'Profile not found'
      }, { status: 404 });
    }

    // Get user profile data with location and profile image
    const { data: userResult, error: userError } = await supabase
      .from('users')
      .select(`
        id,
        name,
        email,
        user_type,
        location,
        profile_image,
        city,
        state_province,
        pincode,
        country,
        email_verified,
        phone,
        phone_verified,
        profile_data,
        created_at,
        ngo_volunteer_capacity
      `)
      .eq('id', parsedUserId)
      .single();

    if (userError || !userResult) {
      return Response.json({ 
        success: false,
        error: 'Profile not found' 
      }, { status: 404 });
    }

    // Get verification status based on user type - check database only
    let verificationStatus = 'unverified';
    let verificationDetails = null;

    if (userResult.user_type === 'individual') {
      const { data: verification } = await supabase
        .from('individual_verifications')
        .select('verification_status, aadhaar_verified, pan_verified, verification_date, aadhaar_number, pan_number, aadhaar_verified_at, pan_verified_at')
        .eq('user_id', parsedUserId)
        .single();
      
      if (verification) {
        verificationStatus = verification.verification_status;
        verificationDetails = {
          ...verification,
          aadhaar_verification_date: verification.aadhaar_verified_at,
          pan_verification_date: verification.pan_verified_at,
        };
      }
    } else if (userResult.user_type === 'company') {
      const { data: verification } = await supabase
        .from('company_verifications')
        .select('verification_status, company_name, verification_date, registration_number, gst_number')
        .eq('user_id', parsedUserId)
        .single();
      
      if (verification) {
        verificationStatus = verification.verification_status;
        verificationDetails = verification;
      }
    } else if (userResult.user_type === 'ngo') {
      const { data: verification } = await supabase
        .from('ngo_verifications')
        .select('verification_status, ngo_name, verification_date, registration_number, registration_type, fcra_number')
        .eq('user_id', parsedUserId)
        .single();
      
      if (verification) {
        verificationStatus = verification.verification_status;
        verificationDetails = verification;
      }
    }

    // Helper function to detect fake/mock location data
    const isFakeLocation = (location: string): boolean => {
      if (!location) return false;
      
      const fakeLocations = [
        'new york',
        'ny',
        'new york, ny',
        'sample location',
        'test location',
        'dummy location',
        'fake location',
        'mock location',
        'placeholder location'
      ];
      
      return fakeLocations.some(fake => 
        location.toLowerCase().includes(fake)
      );
    };

    const parseProfileRecord = (value: unknown): Record<string, unknown> => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
      }
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : {};
        } catch {
          return {};
        }
      }
      return {};
    };

    const rawProfileData = parseProfileRecord(userResult.profile_data);
    const nestedProfileData = parseProfileRecord(rawProfileData.profile_data);
    const profileData = backfillNgoDocumentExpiries(
      backfillNgoComplianceProfileData({
        ...nestedProfileData,
        ...rawProfileData,
      }).profileData
    ).profileData;

    const scheduleViiSectors = Array.from(
      new Set(
        (
          Array.isArray(profileData.sectors_schedule_vii)
            ? profileData.sectors_schedule_vii
            : typeof profileData.sectors_schedule_vii === 'string' && String(profileData.sectors_schedule_vii).trim()
              ? [profileData.sectors_schedule_vii]
              : String(profileData.sector || '').trim()
                ? [profileData.sector]
                : []
        )
          .map((item) => String(item || '').trim())
          .filter(Boolean)
      )
    );

    let nextProfileData = profileData;
    let caBadgeNumber: string | null = null;
    if (verificationStatus === 'verified') {
      const attached = applyCaBadgeToProfile(profileData, parsedUserId);
      nextProfileData = attached.profileData;
      caBadgeNumber = attached.badge;
      if (attached.changed) {
        await supabase
          .from('users')
          .update({ profile_data: nextProfileData })
          .eq('id', parsedUserId);
      }
    }

    const formattedProfile: Record<string, unknown> = {
      ...userResult,
      phone: userResult.phone || null,
      address: (userResult.location && !isFakeLocation(userResult.location)) ? userResult.location : null,
      bio:
        typeof profileData.bio === 'string' && profileData.bio.trim()
          ? profileData.bio
          : typeof (userResult as { bio?: unknown }).bio === 'string'
            ? String((userResult as { bio?: unknown }).bio)
            : null,
      cover_image: getCoverImageUrl(profileData),
      skills: [],
      interests: [],
      website: typeof profileData.website === 'string' ? profileData.website : null,
      portfolio: [],
      volunteering_history: Array.isArray(profileData.volunteering_history)
        ? profileData.volunteering_history.filter(
            (entry: any) =>
              entry &&
              typeof entry === 'object' &&
              String(entry.campaign_id || '') &&
              Number(entry.days_present || 0) > 0 &&
              Number(entry.project_days || 0) > 0
          )
        : [],
      profile_data: nextProfileData,
      verification_status: verificationStatus,
      verification_details: verificationDetails,
      ca_badge_number: caBadgeNumber,
    };

    if (userResult.user_type === 'ngo') {
      const { data: platformProjects } = await supabase
        .from('service_request_projects')
        .select('title, description, location, exact_address, timeline, status, expected_beneficiaries, valid_until')
        .eq('ngo_id', parsedUserId)
        .order('created_at', { ascending: false });

      const headquarters =
        profileData.ngo_headquarters && typeof profileData.ngo_headquarters === 'object'
          ? (profileData.ngo_headquarters as Record<string, unknown>)
          : {};

      const ngoVerification = verificationDetails as {
        registration_type?: string | null;
        registration_number?: string | null;
        fcra_number?: string | null;
      } | null;

      const complianceDocuments: Array<{
        key: ComplianceDocumentKey | 'fcra';
        label: string;
        url: string;
        registration_number: string | null;
      }> = (['twelve_a', 'eighty_g', 'csr1'] as ComplianceDocumentKey[])
        .map((key) => {
          const documents =
            profileData.compliance_documents && typeof profileData.compliance_documents === 'object'
              ? (profileData.compliance_documents as Record<string, unknown>)
              : {};
          const url = getComplianceDocumentUrl(documents[key]);
          if (!url) return null;

          const numberKey =
            key === 'twelve_a'
              ? 'twelve_a_number'
              : key === 'eighty_g'
                ? 'eighty_g_number'
                : 'csr1_registration_number';

          return {
            key,
            label: COMPLIANCE_DOCUMENT_LABELS[key],
            url,
            registration_number: String(profileData[numberKey] || '').trim() || null,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item != null);

      const fcraUrl = getNgoFcraDocumentUrl(profileData);
      if (fcraUrl) {
        complianceDocuments.push({
          key: 'fcra',
          label: 'FCRA Registration',
          url: fcraUrl,
          registration_number:
            String(ngoVerification?.fcra_number || profileData.fcra_number || '').trim() || null,
        });
      }

      formattedProfile.ngo_public = {
        sectors_schedule_vii: scheduleViiSectors,
        registration_type: ngoVerification?.registration_type || null,
        registration_number: ngoVerification?.registration_number || null,
        fcra_number: ngoVerification?.fcra_number || null,
        fcra_expiry_date:
          listDocumentExpiryPublicItems(profileData).find((item) => item.key === 'fcra')?.valid_until ||
          (typeof profileData.fcra_expiry_date === 'string' ? profileData.fcra_expiry_date : null),
        document_expiries: listDocumentExpiryPublicItems(nextProfileData),
        founded: profileData.founded || profileData.founded_year || null,
        volunteer_capacity: profileData.team_strength || profileData.ngo_volunteer_capacity || userResult.ngo_volunteer_capacity || null,
        geographic_coverage_preview: summarizeGeographicCoverage(profileData.geographic_coverage, 3),
        office_address: buildNgoLocationDisplay({
          address_line: String(headquarters.address_line || ''),
          city: String(headquarters.city || userResult.city || ''),
          state: String(headquarters.state || userResult.state_province || ''),
          pincode: String(headquarters.pincode || userResult.pincode || ''),
          country: String(headquarters.country || userResult.country || 'India'),
        }) || null,
        past_projects: mergeNgoPastProjects(profileData.past_projects, platformProjects || []),
        work_areas: normalizeGeographicCoverage(profileData.geographic_coverage),
        execution_capacity: normalizeExecutionCapacity(profileData.execution_capacity),
        compliance_documents: complianceDocuments,
        ca_compliance_tags: getCaComplianceTags(profileData, verificationStatus),
        accepts_payments:
          String(verificationStatus || '').toLowerCase() === 'verified' &&
          isNgoRazorpayPayoutActive(profileData),
        csr_eligible: ngoIsCsrEligible(verificationStatus, profileData),
      };
    }

    return Response.json({
      success: true,
      profile: formattedProfile
    });

  } catch (error: any) {
    console.error('Profile fetch error:', error);
    console.error('Error stack:', error.stack);
    return Response.json({ 
      success: false,
      error: 'Failed to fetch profile',
      details: error.message 
    }, { status: 500 });
  }
}