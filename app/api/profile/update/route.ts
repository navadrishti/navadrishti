import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { verifyToken } from '@/lib/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Validation schema for PUT request (authenticated users updating their own profile)
const updateProfileSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters').optional(),
  profileImageUrl: z.string().url().optional(),
  city: z.string().optional(),
  state_province: z.string().optional(),
  pincode: z.string().optional(),
  country: z.string().optional(),
  phone: z.string().optional(),
  bio: z.string().optional(),
  location: z.string().optional(),
  timezone: z.string().optional(),
  experience: z.string().optional(),
  proof_of_work: z.array(z.string()).optional(),
  resume_url: z.string().optional(),
  skills: z.string().optional(),
  interests: z.string().optional()
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      userId, 
      name,
      email,
      profileImageUrl, 
      city, 
      state_province, 
      pincode, 
      country, 
      phone, 
      bio,
      location,
      timezone,
      profile_data
    } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Prepare update data - only include fields that are provided
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (profileImageUrl !== undefined) updateData.profile_image = profileImageUrl;
    if (city !== undefined) updateData.city = city;
    if (state_province !== undefined) updateData.state_province = state_province;
    if (pincode !== undefined) updateData.pincode = pincode;
    if (country !== undefined) updateData.country = country;
    if (phone !== undefined) updateData.phone = phone;
    if (location !== undefined) updateData.location = location;
    if (timezone !== undefined) updateData.timezone = timezone;

    // Handle profile_data for additional fields (including bio)
    if (profile_data && typeof profile_data === 'object') {
      // Get current profile_data first
      const { data: currentUser, error: fetchError } = await supabase
        .from('users')
        .select('profile_data')
        .eq('id', userId)
        .single();

      if (fetchError) {
        console.error('Error fetching current user data:', fetchError);
        return NextResponse.json(
          { error: 'Failed to fetch current user data' },
          { status: 500 }
        );
      }

      const currentProfileData = currentUser?.profile_data || {};
      const newProfileData = { ...currentProfileData, ...profile_data };

      updateData.profile_data = newProfileData;
    }

    // Only proceed if there's data to update
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No data provided to update' },
        { status: 400 }
      );
    }

    // Add updated timestamp
    updateData.updated_at = new Date().toISOString();

    // Update the user's profile in the database
    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', userId)
      .select();

    if (error) {
      console.error('Error updating profile:', error);
      return NextResponse.json(
        { error: 'Failed to update profile' },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Profile updated successfully',
      user: data[0]
    });

  } catch (error) {
    console.error('Error in profile update API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT method for authenticated users updating their own profile
export async function PUT(request: NextRequest) {
  try {
    // Get authenticated user
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    
    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const userId = payload.id;
    
    const body = await request.json();
    
    const validationResult = updateProfileSchema.safeParse(body);
    
    if (!validationResult.success) {
      console.error('Validation failed:', validationResult.error.errors);
      return NextResponse.json({ 
        error: validationResult.error.errors[0].message,
        details: validationResult.error.errors
      }, { status: 400 });
    }
    
    const updateData = validationResult.data;
    
    // Custom validation for resume_url - must be valid URL if not empty
    if (updateData.resume_url && updateData.resume_url.trim() !== '') {
      try {
        new URL(updateData.resume_url);
      } catch {
        return NextResponse.json({ 
          error: 'Resume URL must be a valid URL' 
        }, { status: 400 });
      }
    }
    
    // Custom validation for proof_of_work - all URLs must be valid
    if (updateData.proof_of_work && Array.isArray(updateData.proof_of_work)) {
      for (const url of updateData.proof_of_work) {
        if (url && url.trim() !== '') {
          try {
            new URL(url);
          } catch {
            return NextResponse.json({ 
              error: `Invalid proof of work URL: ${url}` 
            }, { status: 400 });
          }
        }
      }
    }
    
    // Remove undefined values
    const cleanUpdateData = Object.fromEntries(
      Object.entries(updateData).filter(([_, value]) => value !== undefined)
    );
    
    if (Object.keys(cleanUpdateData).length === 0) {
      return NextResponse.json(
        { error: 'No data provided to update' },
        { status: 400 }
      );
    }

    // Add updated timestamp
    cleanUpdateData.updated_at = new Date().toISOString();
    
    // Get current profile_data to merge with new data
    
    // First try with just profile_data
    let { data: currentUser, error: fetchError } = await supabase
      .from('users')
      .select('profile_data')
      .eq('id', userId)
      .single();

    if (fetchError) {
      // Try with just id to test basic access
      const { data: testUser, error: testError } = await supabase
        .from('users')
        .select('id')
        .eq('id', userId)
        .single();
        
      if (testError) {
        return NextResponse.json(
          { error: 'Failed to access user data' },
          { status: 500 }
        );
      }
      
      currentUser = { profile_data: {} };
    }





    // Separate profile_data fields from direct user fields
    const { proof_of_work, resume_url, skills, interests, experience, ...directUserFields } = cleanUpdateData;
    
    // Prepare profile_data update
    const currentProfileData = currentUser?.profile_data || {};
    const updatedProfileData = { ...currentProfileData };
    
    // Only update profile_data fields that were provided
    if (proof_of_work !== undefined) updatedProfileData.proof_of_work = proof_of_work;
    if (resume_url !== undefined) updatedProfileData.resume_url = resume_url;
    if (skills !== undefined) updatedProfileData.skills = skills;
    if (interests !== undefined) updatedProfileData.interests = interests;
    if (experience !== undefined) updatedProfileData.experience = experience;
    
    // Prepare final update data
    const finalUpdateData = {
      ...directUserFields,
      profile_data: updatedProfileData,
      updated_at: new Date().toISOString()
    };
    
    // Update the user's profile in the database
    
    const { data, error } = await supabase
      .from('users')
      .update(finalUpdateData)
      .eq('id', userId)
      .select('id, email, name, user_type, profile_image, city, state_province, pincode, country, phone, profile_data, location, timezone');

    if (error) {
      console.error('Error updating profile:', error);
      return NextResponse.json(
        { error: 'Failed to update profile' },
        { status: 500 }
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }



    // Format response to include profile_data fields at the top level for compatibility
    const user = data[0];
    const profileData = user.profile_data || {};
    
    const formattedUser = {
      ...user,
      proof_of_work: profileData.proof_of_work || [],
      resume_url: profileData.resume_url || '',
      skills: profileData.skills || '',
      interests: profileData.interests || '',
      experience: profileData.experience || ''
    };

    return NextResponse.json({ 
      success: true, 
      message: 'Profile updated successfully',
      user: formattedUser
    });

  } catch (error) {
    console.error('Error in profile update API (PUT):', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}