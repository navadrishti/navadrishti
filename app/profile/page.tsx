'use client'

import { useState, useEffect } from 'react'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/lib/auth-context'
import { UserCheck, Shield, Settings, User } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { VerificationBadge, VerificationDetails } from '@/components/verification-badge'

// Phone Verification Component
function PhoneVerificationSection({ phone, onVerificationComplete }: { 
  phone: string, 
  onVerificationComplete: () => void 
}) {
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  const sendOtp = async () => {
    try {
      setSendingOtp(true);
      const token = localStorage.getItem('token');
      const response = await fetch('/api/auth/send-phone-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ phone })
      });

      const data = await response.json();
      if (response.ok) {
        setOtpSent(true);
        if (data.otp) {
          // Development mode - show OTP
          toast.success(`SMS service not configured. OTP: ${data.otp}`);
          console.log('Development OTP:', data.otp);
        } else {
          // Production mode - OTP sent via SMS
          toast.success('OTP sent to your phone!');
        }
      } else {
        toast.error(data.error || 'Failed to send OTP');
      }
    } catch (error) {
      toast.error('Failed to send OTP');
    } finally {
      setSendingOtp(false);
    }
  };

  const verifyOtp = async () => {
    if (!otp.trim()) {
      toast.error('Please enter the OTP');
      return;
    }

    try {
      setVerifyingOtp(true);
      const token = localStorage.getItem('token');
      const response = await fetch('/api/auth/verify-phone', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ phone, otp })
      });

      const data = await response.json();
      if (response.ok) {
        toast.success('Phone verified successfully!');
        setOtpSent(false);
        setOtp('');
        onVerificationComplete();
      } else {
        toast.error(data.error || 'Invalid OTP');
      }
    } catch (error) {
      toast.error('Failed to verify OTP');
    } finally {
      setVerifyingOtp(false);
    }
  };

  return (
    <div className="space-y-2">
      {!otpSent ? (
        <Button 
          variant="outline" 
          size="sm" 
          className="w-full"
          onClick={sendOtp}
          disabled={sendingOtp}
        >
          {sendingOtp ? 'Sending...' : 'Send Phone Verification'}
        </Button>
      ) : (
        <div className="space-y-2">
          <Input
            type="text"
            placeholder="Enter 6-digit OTP"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            maxLength={6}
            className="text-center text-lg tracking-widest"
          />
          <div className="flex gap-2">
            <Button 
              size="sm" 
              onClick={verifyOtp}
              disabled={verifyingOtp}
              className="flex-1"
            >
              {verifyingOtp ? 'Verifying...' : 'Verify OTP'}
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => {
                setOtpSent(false);
                setOtp('');
              }}
            >
              Cancel
            </Button>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={sendOtp}
            disabled={sendingOtp}
            className="w-full text-xs"
          >
            {sendingOtp ? 'Resending...' : 'Resend OTP'}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const { user, updateUser, refreshUser } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [verificationData, setVerificationData] = useState<any>(null);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);
  const [profileImageUrl, setProfileImageUrl] = useState<string>('');
  const [projectPhotos, setProjectPhotos] = useState<File[]>([]);
  const [projectPhotoUrls, setProjectPhotoUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [portfolioDescription, setPortfolioDescription] = useState('');
  const [certifications, setCertifications] = useState('');
  
  // Location fields for nearby functionality
  const [city, setCity] = useState('');
  const [stateProvince, setStateProvince] = useState('');
  const [pincode, setPincode] = useState('');
  const [country, setCountry] = useState('India');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  
  // Skills & Interests for individuals
  const [skills, setSkills] = useState('');
  const [interests, setInterests] = useState('');
  const [categories, setCategories] = useState('');
  
  // Organization details for NGOs
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [foundedYear, setFoundedYear] = useState('');
  const [focusAreas, setFocusAreas] = useState('');
  const [organizationWebsite, setOrganizationWebsite] = useState('');
  
  // Company details for companies
  const [industry, setIndustry] = useState('');
  const [companySize, setCompanySize] = useState('');
  const [companyWebsite, setCompanyWebsite] = useState('');

  useEffect(() => {
    if (user) {
      fetchProfile();
      fetchVerificationStatus();
    }
  }, [user]);

  // Add real-time refresh when page becomes visible - FIXED to prevent infinite loop
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && user) {
        console.log('Page became visible, refreshing profile data...');
        fetchProfile();
        fetchVerificationStatus();
      }
    };

    const handleFocus = () => {
      if (user) {
        console.log('Window focused, refreshing profile data...');
        fetchProfile();
        fetchVerificationStatus();
      }
    };

    // Listen for visibility and focus changes
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    // REMOVED AUTO-REFRESH INTERVAL TO PREVENT INFINITE LOOP
    // Auto-refresh was causing infinite loop by triggering user state updates

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      // No interval to clear anymore
    };
  }, [user]); // Keep user dependency to refresh when user changes

  const fetchProfile = async () => {
    try {
      // REMOVED refreshUser() call to prevent infinite loop
      // Only fetch profile data directly without updating auth context
      
      // Fetch fresh profile data from API
      const token = localStorage.getItem('token');
      if (!token) {
        console.error('No auth token found');
        return;
      }

      console.log('Fetching fresh profile data from API...');
      const response = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch profile data');
      }

      const data = await response.json();
      const freshUser = data.user;
      console.log('Fresh user data received:', freshUser);
      
      // Set profile with fresh data
      setProfile({
        ...freshUser,
        bio: freshUser?.bio || '',
        phone: freshUser?.phone || '',
        address: '',
        skills: [],
        interests: [],
        portfolio: [],
        experience: '',
        website: ''
      });
      
      // Load location fields from fresh user data
      setCity(freshUser?.city || '');
      setStateProvince(freshUser?.state_province || '');
      setPincode(freshUser?.pincode || '');
      setCountry(freshUser?.country || 'India');
      setPhone(freshUser?.phone || '');
      setBio(freshUser?.bio || '');
      
      // Load additional profile fields from profile_data
      const userProfile = freshUser?.profile_data || {};
      console.log('Profile data loaded:', userProfile);
      setSkills(userProfile.skills || '');
      setInterests(userProfile.interests || '');
      setCategories(userProfile.categories || '');
      setRegistrationNumber(userProfile.registration_number || '');
      setFoundedYear(userProfile.founded_year || '');
      setFocusAreas(userProfile.focus_areas || '');
      setOrganizationWebsite(userProfile.organization_website || '');
      setIndustry(userProfile.industry || '');
      setCompanySize(userProfile.company_size || '');
      setCompanyWebsite(userProfile.company_website || '');
      
      // Load profile image if available
      if (freshUser?.profile_image) {
        console.log('Setting profile image:', freshUser.profile_image);
        setProfileImageUrl(freshUser.profile_image);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      // Fallback to cached user data if API fails
      if (user) {
        console.log('Using cached user data as fallback');
        setProfile({
          ...user,
          bio: user?.bio || '',
          phone: user?.phone || '',
          address: '',
          skills: [],
          interests: [],
          portfolio: [],
          experience: '',
          website: ''
        });
        
        // Load location fields from cached user data
        setCity(user?.city || '');
        setStateProvince(user?.state_province || '');
        setPincode(user?.pincode || '');
        setCountry(user?.country || 'India');
        setPhone(user?.phone || '');
        setBio(user?.bio || '');
        
        // Load additional profile fields
        const userProfile = (user as any)?.profile_data || (user as any)?.profile || {};
        setSkills(userProfile.skills || '');
        setInterests(userProfile.interests || '');
        setCategories(userProfile.categories || '');
        setRegistrationNumber(userProfile.registration_number || '');
        setFoundedYear(userProfile.founded_year || '');
        setFocusAreas(userProfile.focus_areas || '');
        setOrganizationWebsite(userProfile.organization_website || '');
        setIndustry(userProfile.industry || '');
        setCompanySize(userProfile.company_size || '');
        setCompanyWebsite(userProfile.company_website || '');
        
        // Load profile image if available
        if (user?.profile_image) {
          setProfileImageUrl(user.profile_image);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchVerificationStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch(`/api/verification/${user?.user_type}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setVerificationData(data);
      }
    } catch (error) {
      console.error('Error fetching verification status:', error);
    }
  };

  const uploadToCloudinary = async (file: File): Promise<string> => {
    const token = localStorage.getItem('token')
    if (!token) {
      throw new Error('Authentication required')
    }

    const formData = new FormData()
    formData.append('file', file)
    
    const response = await fetch('/api/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    })
    
    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || `Failed to upload ${file.name}`)
    }
    
    const result = await response.json()
    // The API returns { success: true, data: { url: ... } }
    return result.data?.url || result.url
  }

  const handleProfileImageUpload = async (files: File[]) => {
    if (files.length === 0) {
      setProfileImageFile(null);
      setProfileImage(null);
      setProfileImageUrl('');
      return;
    }

    const file = files[0];
    setProfileImageFile(file);
    
    // Create preview
    const imageUrl = URL.createObjectURL(file);
    setProfileImage(imageUrl);
    
    // Upload to Cloudinary
    setUploading(true);
    try {
      const cloudinaryUrl = await uploadToCloudinary(file);
      setProfileImageUrl(cloudinaryUrl);
      toast.success('Profile picture uploaded successfully!');
    } catch (error) {
      console.error('Error uploading profile image:', error);
      toast.error('Failed to upload profile picture');
    } finally {
      setUploading(false);
    }
  };

  const handleProjectPhotosUpload = async (files: File[]) => {
    setProjectPhotos(files);
    
    if (files.length > 0) {
      setUploading(true);
      try {
        const uploadPromises = Array.from(files).map(file => uploadToCloudinary(file));
        const urls = await Promise.all(uploadPromises);
        setProjectPhotoUrls(urls);
        toast.success(`${files.length} project photo${files.length > 1 ? 's' : ''} uploaded successfully!`);
      } catch (error) {
        console.error('Error uploading project photos:', error);
        toast.error('Failed to upload project photos');
      } finally {
        setUploading(false);
      }
    }
  };

  const handleSavePortfolio = async () => {
    try {
      setLoading(true);
      
      // Validate that there's something to save
      if (!portfolioDescription.trim() && !certifications.trim() && projectPhotos.length === 0) {
        toast.error('Please add some portfolio content before saving.');
        return;
      }
      
      // Here you would save the portfolio data specifically
      const portfolioData = {
        description: portfolioDescription,
        certifications: certifications,
        projectPhotos: projectPhotos
      };
      
      if (projectPhotos.length > 0) {
        console.log('Portfolio photos to upload:', projectPhotos.map(file => file.name));
      }
      
      // Save portfolio data to the API
      const token = localStorage.getItem('token');
      const response = await fetch('/api/profile/portfolio', { 
        method: 'POST', 
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(portfolioData)
      });

      if (!response.ok) {
        throw new Error('Failed to save portfolio');
      }
      
      // Refresh user data to get updated portfolio info
      await refreshUser();
      await fetchProfile();
      
      const itemCount = [
        portfolioDescription.trim() ? 'description' : null,
        certifications.trim() ? 'certifications' : null,
        projectPhotos.length > 0 ? `${projectPhotos.length} photo${projectPhotos.length > 1 ? 's' : ''}` : null
      ].filter(Boolean);
      
      toast.success(`Portfolio saved successfully! Updated: ${itemCount.join(', ')}`);
    } catch (error) {
      console.error('Error saving portfolio:', error);
      toast.error('Failed to save portfolio. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    try {
      setLoading(true);
      
      // Prepare profile data to save
      const profileData: any = {
        userId: user?.id,
      };
      
      // Add profile image if uploaded
      if (profileImageUrl) {
        profileData.profileImageUrl = profileImageUrl;
      }
      
      // Add location fields - only add non-empty values
      if (city?.trim()) profileData.city = city.trim();
      if (stateProvince?.trim()) profileData.state_province = stateProvince.trim();
      if (pincode?.trim()) profileData.pincode = pincode.trim();
      if (country?.trim()) profileData.country = country.trim();
      if (phone?.trim()) profileData.phone = phone.trim();
      if (bio?.trim()) profileData.bio = bio.trim();
      
      // Save all profile data
      const response = await fetch('/api/profile/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(profileData),
      });

      if (!response.ok) {
        throw new Error('Failed to update profile');
      }

      // Refresh the profile page data immediately to show updated values
      await fetchProfile();
      
      console.log('Profile saved successfully:', profileData);
      
      if (projectPhotoUrls.length > 0) {
        console.log('Project photo URLs to save:', projectPhotoUrls);
      }
      
      toast.success('Profile saved successfully!');
    } catch (error) {
      console.error('Error saving profile:', error);
      toast.error('Failed to save profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSkillsInterests = async () => {
    if (!user?.id) return;
    
    try {
      setLoading(true);
      
      const skillsData = {
        userId: user.id,
        skills,
        interests,
        categories
      };
      
      const response = await fetch('/api/profile/skills', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(skillsData)
      });

      if (!response.ok) {
        throw new Error('Failed to save skills and interests');
      }

      await refreshUser();
      // Also refresh the profile page data immediately
      await fetchProfile();
      toast.success('Skills and interests saved successfully!');
    } catch (error) {
      console.error('Error saving skills and interests:', error);
      toast.error('Failed to save skills and interests. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveOrganizationDetails = async () => {
    if (!user?.id) return;
    
    try {
      setLoading(true);
      
      const organizationData = {
        userId: user.id,
        registration_number: registrationNumber,
        founded_year: foundedYear,
        focus_areas: focusAreas,
        organization_website: organizationWebsite
      };
      
      const response = await fetch('/api/profile/organization', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(organizationData)
      });

      if (!response.ok) {
        throw new Error('Failed to save organization details');
      }

      await refreshUser();
      // Also refresh the profile page data immediately
      await fetchProfile();
      toast.success('Organization details saved successfully!');
    } catch (error) {
      console.error('Error saving organization details:', error);
      toast.error('Failed to save organization details. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCompanyDetails = async () => {
    if (!user?.id) return;
    
    try {
      setLoading(true);
      
      const companyData = {
        userId: user.id,
        industry,
        company_size: companySize,
        company_website: companyWebsite
      };
      
      const response = await fetch('/api/profile/company', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(companyData)
      });

      if (!response.ok) {
        throw new Error('Failed to save company details');
      }

      await refreshUser();
      // Also refresh the profile page data immediately
      await fetchProfile();
      toast.success('Company details saved successfully!');
    } catch (error) {
      console.error('Error saving company details:', error);
      toast.error('Failed to save company details. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 px-6 py-8 md:px-10">
          <div className="text-center py-8">
            <h1 className="text-2xl font-bold mb-4">Sign In Required</h1>
            <Link href="/login">
              <Button>Sign In</Button>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      
      <main className="flex-1 px-6 py-8 md:px-10">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
            <p className="text-muted-foreground">
              Manage your profile information and verification status
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <div className="md:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Basic Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Profile Picture */}
                  <div>
                    <Label>Profile Picture</Label>
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
                      <input
                        type="file"
                        accept="image/jpeg,image/jpg,image/png,image/webp"
                        onChange={(e) => {
                          const files = Array.from(e.target.files || [])
                          handleProfileImageUpload(files)
                        }}
                        className="hidden"
                        id="profile-image-upload"
                      />
                      <div className="text-center">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => document.getElementById('profile-image-upload')?.click()}
                          disabled={uploading}
                          className="mb-4"
                        >
                          {uploading ? 'Uploading...' : 'Upload Profile Picture'}
                        </Button>
                        <p className="text-sm text-gray-500">
                          Max 2MB. Supports JPEG, PNG, WebP
                        </p>
                      </div>
                      
                      {/* Profile Image Preview */}
                      {profileImage && (
                        <div className="mt-4 flex justify-center">
                          <div className="relative">
                            <img
                              src={profileImage}
                              alt="Profile preview"
                              className="w-32 h-32 object-cover rounded-full"
                            />
                            {profileImageUrl && (
                              <div className="absolute bottom-2 right-2 bg-green-500 text-white rounded-full w-6 h-6 flex items-center justify-center">
                                ✓
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Full Name</Label>
                      <Input value={user.name || 'Please update your name'} readOnly />
                    </div>
                    <div>
                      <Label>Email</Label>
                      <div className="relative">
                        <Input value={user.email} readOnly />
                        {!user?.email_verified && (
                          <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                            <Badge variant="outline" className="text-xs">Not Verified</Badge>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Account Type</Label>
                      <Input value={user.user_type.charAt(0).toUpperCase() + user.user_type.slice(1)} readOnly />
                    </div>
                    <div>
                      <Label>Phone Number</Label>
                      <div className="relative">
                        <Input 
                          placeholder={phone ? "" : "Enter your phone number"} 
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                        />
                        {phone && !user?.phone_verified && (
                          <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                            <Badge variant="outline" className="text-xs">Not Verified</Badge>
                          </div>
                        )}
                        {!phone && (
                          <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                            <Badge variant="outline" className="text-xs text-gray-400">Not Set</Badge>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Location Fields for Nearby Functionality */}
                  <div className="space-y-4">
                    <div className="border-t pt-4">
                      <h3 className="text-lg font-medium mb-4">Location Information</h3>
                      <p className="text-sm text-gray-600 mb-4">
                        This information helps others find your items in the nearby section
                      </p>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>City</Label>
                        <Input 
                          placeholder="e.g., Mumbai, Delhi, Bangalore" 
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>State/Province</Label>
                        <Input 
                          placeholder="e.g., Maharashtra, Delhi, Karnataka" 
                          value={stateProvince}
                          onChange={(e) => setStateProvince(e.target.value)}
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Pin Code</Label>
                        <Input 
                          placeholder="e.g., 400001, 110001" 
                          value={pincode}
                          onChange={(e) => setPincode(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Country</Label>
                        <Input 
                          value={country}
                          onChange={(e) => setCountry(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <Label>Bio</Label>
                    <Textarea 
                      placeholder={`Tell others about yourself as ${user.user_type === 'ngo' ? 'an organization' : user.user_type === 'company' ? 'a company' : 'an individual'}...`}
                      rows={4}
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                    />
                  </div>
                  <Button onClick={handleSaveProfile} disabled={loading}>
                    {loading ? 'Saving...' : 'Update Profile'}
                  </Button>
                </CardContent>
              </Card>

              {user.user_type === 'ngo' && (
                <Card>
                  <CardHeader>
                    <CardTitle>Organization Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Registration Number</Label>
                        <Input 
                          value={registrationNumber}
                          onChange={(e) => setRegistrationNumber(e.target.value)}
                          placeholder="NGO registration number" 
                        />
                      </div>
                      <div>
                        <Label>Founded Year</Label>
                        <Input 
                          type="number" 
                          value={foundedYear}
                          onChange={(e) => setFoundedYear(e.target.value)}
                          placeholder="YYYY" 
                        />
                      </div>
                    </div>
                    <div>
                      <Label>Focus Areas</Label>
                      <Input 
                        value={focusAreas}
                        onChange={(e) => setFocusAreas(e.target.value)}
                        placeholder="Education, Healthcare, Environment, etc." 
                      />
                    </div>
                    <div>
                      <Label>Website</Label>
                      <Input 
                        value={organizationWebsite}
                        onChange={(e) => setOrganizationWebsite(e.target.value)}
                        placeholder="https://your-organization.org" 
                      />
                    </div>
                    <div className="flex justify-end pt-4 border-t">
                      <Button 
                        onClick={handleSaveOrganizationDetails} 
                        disabled={loading}
                        className="flex items-center gap-2"
                      >
                        {loading ? 'Saving...' : 'Save Organization Details'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {user.user_type === 'company' && (
                <Card>
                  <CardHeader>
                    <CardTitle>Company Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Industry</Label>
                        <Input 
                          value={industry}
                          onChange={(e) => setIndustry(e.target.value)}
                          placeholder="Technology, Healthcare, Education, etc." 
                        />
                      </div>
                      <div>
                        <Label>Company Size</Label>
                        <Input 
                          value={companySize}
                          onChange={(e) => setCompanySize(e.target.value)}
                          placeholder="1-10, 11-50, 51-200, etc." 
                        />
                      </div>
                    </div>
                    <div>
                      <Label>Website</Label>
                      <Input 
                        value={companyWebsite}
                        onChange={(e) => setCompanyWebsite(e.target.value)}
                        placeholder="https://your-company.com" 
                      />
                    </div>
                    <div className="flex justify-end pt-4 border-t">
                      <Button 
                        onClick={handleSaveCompanyDetails} 
                        disabled={loading}
                        className="flex items-center gap-2"
                      >
                        {loading ? 'Saving...' : 'Save Company Details'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {user.user_type === 'individual' && (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle>Skills & Interests</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <Label>Skills</Label>
                        <Input 
                          value={skills}
                          onChange={(e) => setSkills(e.target.value)}
                          placeholder="Teaching, Project Management, Communication, etc." 
                        />
                      </div>
                      <div>
                        <Label>Interests</Label>
                        <Input 
                          value={interests}
                          onChange={(e) => setInterests(e.target.value)}
                          placeholder="Volunteering areas you're interested in" 
                        />
                      </div>
                      <div>
                        <Label>Categories</Label>
                        <Input 
                          value={categories}
                          onChange={(e) => setCategories(e.target.value)}
                          placeholder="Community Service, Social Work, Environmental, etc." 
                        />
                      </div>
                      <div className="flex justify-end pt-4 border-t">
                        <Button 
                          onClick={handleSaveSkillsInterests} 
                          disabled={loading}
                          className="flex items-center gap-2"
                        >
                          {loading ? 'Saving...' : 'Save Skills & Interests'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Portfolio & Past Work</CardTitle>
                      <CardDescription>
                        Showcase your previous projects and achievements
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <Label>Portfolio Description</Label>
                        <Textarea 
                          value={portfolioDescription}
                          onChange={(e) => setPortfolioDescription(e.target.value)}
                          placeholder="Describe your experience and notable projects..."
                          rows={3}
                        />
                      </div>
                      
                      <div>
                        <Label>Project Photos</Label>
                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
                          <input
                            type="file"
                            multiple
                            accept="image/jpeg,image/jpg,image/png,image/webp"
                            onChange={(e) => {
                              const files = Array.from(e.target.files || [])
                              handleProjectPhotosUpload(files)
                            }}
                            className="hidden"
                            id="project-photos-upload"
                          />
                          <div className="text-center">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => document.getElementById('project-photos-upload')?.click()}
                              disabled={uploading}
                              className="mb-4"
                            >
                              {uploading ? 'Uploading...' : 'Upload Project Photos'}
                            </Button>
                            <p className="text-sm text-gray-500">
                              Upload up to 10 images (max 5MB each). Supports JPEG, PNG, WebP
                            </p>
                          </div>
                          
                          {/* Project Photos Preview */}
                          {projectPhotos.length > 0 && (
                            <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-4">
                              {projectPhotos.map((file, index) => (
                                <div key={index} className="relative">
                                  <img
                                    src={URL.createObjectURL(file)}
                                    alt={`Project ${index + 1}`}
                                    className="w-full h-32 object-cover rounded-lg"
                                  />
                                  {projectPhotoUrls[index] && (
                                    <div className="absolute bottom-2 right-2 bg-green-500 text-white rounded-full w-6 h-6 flex items-center justify-center">
                                      ✓
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div>
                        <Label>Certifications</Label>
                        <Textarea 
                          value={certifications}
                          onChange={(e) => setCertifications(e.target.value)}
                          placeholder="List any relevant certifications or qualifications..."
                          rows={2}
                        />
                      </div>
                      
                      <div className="flex justify-end pt-4 border-t">
                        <Button 
                          onClick={handleSavePortfolio} 
                          disabled={loading}
                          className="flex items-center gap-2"
                        >
                          {loading ? 'Saving...' : 'Save Portfolio'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Verification Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Document Status</span>
                      <VerificationBadge 
                        status={user?.verification_status || 'unverified'} 
                        size="md"
                      />
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Email Verification</span>
                      <VerificationBadge 
                        status={user?.email_verified ? 'verified' : 'unverified'} 
                        size="sm"
                      />
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Phone Verification</span>
                      <VerificationBadge 
                        status={user?.phone_verified ? 'verified' : 'unverified'} 
                        size="sm"
                      />
                    </div>
                    
                    {user?.verification_details && (
                      <VerificationDetails 
                        userType={user.user_type as 'individual' | 'company' | 'ngo'}
                        verificationDetails={user.verification_details}
                        className="bg-gray-50 p-4 rounded-lg"
                      />
                    )}
                    
                    <div className="pt-4 border-t space-y-2">
                      <Link href="/verification">
                        <Button variant="outline" size="sm" className="w-full">
                          <UserCheck className="h-4 w-4 mr-2" />
                          {user?.verification_status === 'verified' ? "Manage Documents" : "Verify Documents"}
                        </Button>
                      </Link>
                      
                      {!user?.email_verified && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="w-full"
                          onClick={async () => {
                            try {
                              const token = localStorage.getItem('token');
                              const response = await fetch('/api/auth/send-verification-email', {
                                method: 'POST',
                                headers: { 'Authorization': `Bearer ${token}` }
                              });
                              const data = await response.json();
                              if (response.ok) {
                                if (data.sent) {
                                  toast.success('Verification email sent to your inbox!');
                                } else {
                                  toast.info('Email service not configured. Check console for verification link.');
                                  console.log('Verification link:', data.verificationUrl);
                                }
                              } else {
                                toast.error(data.error || 'Failed to send email');
                              }
                            } catch (error) {
                              toast.error('Failed to send verification email');
                            }
                          }}
                        >
                          Send Email Verification
                        </Button>
                      )}
                      
                      {phone && !user?.phone_verified && (
                        <PhoneVerificationSection 
                          phone={phone}
                          onVerificationComplete={async () => {
                            await fetchProfile();
                            await fetchVerificationStatus();
                          }}
                        />
                      )}
                      
                      {!phone && (
                        <div className="text-center py-2">
                          <p className="text-sm text-gray-500 mb-2">
                            Add your phone number above to enable SMS verification
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Link href="/settings" className="block">
                    <Button variant="outline" size="sm" className="w-full justify-start">
                      <Settings className="h-4 w-4 mr-2" />
                      Account Settings
                    </Button>
                  </Link>
                  <Link href={`/${user.user_type}s/dashboard`} className="block">
                    <Button variant="outline" size="sm" className="w-full justify-start">
                      Dashboard
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}