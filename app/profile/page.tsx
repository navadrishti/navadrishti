'use client'

import React from 'react'
import { useState, useEffect } from 'react'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/lib/auth-context'
import { useOtpSender } from '@/hooks/use-otp-sender'
import { Shield, Settings, User } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { VerificationBadge, VerificationDetails } from '@/components/verification-badge'

type FormErrors = Record<string, string>;

export default function ProfilePage() {
  const { user, updateUser, refreshUser } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [verificationData, setVerificationData] = useState<any>(null);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);
  const [profileImageUrl, setProfileImageUrl] = useState<string>('');
  const [uploadingProfileImage, setUploadingProfileImage] = useState(false);
  const [projectPhotos, setProjectPhotos] = useState<File[]>([]);
  const [projectPhotoUrls, setProjectPhotoUrls] = useState<string[]>([]);
  const [portfolioDescription, setPortfolioDescription] = useState('');
  const [certifications, setCertifications] = useState('');
  
  // Location fields for nearby functionality
  const [city, setCity] = useState('');
  const [stateProvince, setStateProvince] = useState('');
  const [pincode, setPincode] = useState('');
  const [country, setCountry] = useState('India');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  
  // Organization details for NGOs
  const [sector, setSector] = useState('');
  const [foundedYear, setFoundedYear] = useState('');
  const [website, setWebsite] = useState('');
  
  // Company details for companies
  const [industry, setIndustry] = useState('');
  const [companySize, setCompanySize] = useState('');
  
  // Individual specific fields
  const [age, setAge] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [editableEmail, setEditableEmail] = useState('');
  const [editableName, setEditableName] = useState('');
  const [ngoSize, setNgoSize] = useState('');
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [otpInput, setOtpInput] = useState({ email: '', phone: '' });
  const { otpSending, otpSent, otpCooldown, otpVerifying, otpVerified, handleSendEmailOtp, handleVerifyEmailOtp, handleSendPhoneOtp, resetEmailOtpState } = useOtpSender(setFormErrors);
  const resolvedEmailVerified = typeof profile?.email_verified === 'boolean' ? profile.email_verified : !!user?.email_verified;
  const resolvedPhoneVerified = typeof profile?.phone_verified === 'boolean' ? profile.phone_verified : !!user?.phone_verified;
  const resolvedVerificationStatus = profile?.verification_status || user?.verification_status || 'unverified';

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (user) {
      fetchProfile();
      fetchVerificationStatus();
    }
  }, [user]);

  useEffect(() => {
    resetEmailOtpState();
    setOtpInput((prev) => ({ ...prev, email: '' }));
  }, [editableEmail, resetEmailOtpState]);

  const fetchProfile = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        console.error('No auth token found');
        return;
      }

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
      
      // Set profile with fresh data
      setProfile({
        ...freshUser,
        bio: freshUser?.bio || '',
        phone: freshUser?.phone || '',
        address: '',
        portfolio: freshUser?.portfolio || [],
        website: freshUser?.website || ''
      });
      
      // Load location fields from fresh user data
      setCity(freshUser?.city || '');
      setStateProvince(freshUser?.state_province || '');
      setPincode(freshUser?.pincode || '');
      setCountry(freshUser?.country || 'India');
      setPhone(freshUser?.phone || '');
      setBio(freshUser?.bio || '');
      
      // Load additional profile fields from profile_data or direct fields
      const userProfile = freshUser?.profile_data || {};
      setSector(userProfile.sector || '');
      setFoundedYear(userProfile.founded || userProfile.founded_year || '');
      setWebsite(userProfile.website || userProfile.company_website || userProfile.organization_website || '');
      setIndustry(userProfile.industry || '');
      setCompanySize(userProfile.company_size || '');
      setAge(userProfile.age || '');
      setNgoSize(userProfile.ngo_size || '');
      
      // Set editable name and email
      setEditableName(freshUser?.name || '');
      setEditableEmail(freshUser?.email || '');
      
      // Load profile image if available
      if (freshUser?.profile_image) {
        setProfileImageUrl(freshUser.profile_image);
        setProfileImage(freshUser.profile_image);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
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

  const handleProfileImageUpload = async (file: File) => {
    try {
      setUploadingProfileImage(true);
      
      const formData = new FormData();
      formData.append('file', file);
      
      const token = localStorage.getItem('token');
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }
      
      const result = await response.json();
      const imageUrl = result.data.url;
      
      setProfileImageUrl(imageUrl);
      setProfileImage(imageUrl);
      
      // Automatically save the profile image to the database
      const profileData = {
        userId: user?.id,
        profileImageUrl: imageUrl
      };
      
      const saveResponse = await fetch('/api/profile/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(profileData),
      });

      if (saveResponse.ok) {
        await refreshUser(); // Refresh the user data in auth context
        toast.success('Profile picture updated successfully!');
      } else {
        toast.success('Profile picture uploaded successfully! Click "Update Profile" to save changes.');
      }
      
    } catch (error) {
      console.error('Error uploading profile image:', error);
      toast.error('Failed to upload profile picture. Please try again.');
    } finally {
      setUploadingProfileImage(false);
    }
  };

  const handleSaveProfile = async () => {
    try {
      setLoading(true);
      
      if (!user?.id) {
        toast.error('User not authenticated');
        setLoading(false);
        return;
      }
      
      const profileData: any = {
        userId: user.id,
      };
      
      // Include profile image URL if available
      if (profileImageUrl !== undefined) {
        profileData.profileImageUrl = profileImageUrl;
      }
      
      // Basic fields for all user types
      if (editableName !== undefined) profileData.name = editableName;
      if (editableEmail !== undefined) profileData.email = editableEmail;
      if (city !== undefined) profileData.city = city;
      if (stateProvince !== undefined) profileData.state_province = stateProvince;
      if (pincode !== undefined) profileData.pincode = pincode;
      if (country !== undefined) profileData.country = country;
      if (phone !== undefined) profileData.phone = phone;
      
      // User type specific fields
      const profileDataFields: any = {};
      
      // Bio goes in profile_data for all user types
      if (bio !== undefined) profileDataFields.bio = bio;
      
      if (user?.user_type === 'individual') {
        if (age) profileDataFields.age = parseInt(age);
      } else if (user?.user_type === 'company') {
        if (industry) profileDataFields.industry = industry;
        if (companySize) profileDataFields.company_size = companySize;
        if (website) profileDataFields.website = website;
        if (sector) profileDataFields.sector = sector;
        if (foundedYear) profileDataFields.founded = parseInt(foundedYear);
        profileDataFields.company_name = editableName || user?.name;
      } else if (user?.user_type === 'ngo') {
        if (ngoSize) profileDataFields.ngo_size = ngoSize;
        if (sector) profileDataFields.sector = sector;
        if (foundedYear) profileDataFields.founded = parseInt(foundedYear);
        profileDataFields.ngo_name = editableName || user?.name;
      }
      
      // Add profile_data if there are fields to update
      if (Object.keys(profileDataFields).length > 0) {
        profileData.profile_data = profileDataFields;
      }
      
      const response = await fetch('/api/profile/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(profileData),
      });

      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        throw new Error(`Server error: ${response.status}`);
      }

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update profile');
      }

      await fetchProfile();
      toast.success('Profile saved successfully!');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save profile. Please try again.';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 px-6 py-8 md:px-10">
          <div className="max-w-4xl mx-auto">
            <div className="mb-8">
              <div className="h-8 bg-gray-200 animate-pulse rounded w-1/3 mb-2"></div>
              <div className="h-4 bg-gray-200 animate-pulse rounded w-1/2"></div>
            </div>
          </div>
        </main>
      </div>
    );
  }

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
            <h1 className="text-3xl font-bold tracking-tight">Edit Profile</h1>
            <p className="text-muted-foreground">
              Manage your profile information, verification status, and settings
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
                  {/* Profile Picture Section */}
                  <div className="flex flex-col items-center gap-4 pb-4 border-b">
                    <div className="relative">
                      <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-gray-200">
                        {profileImageUrl ? (
                          <img 
                            src={profileImageUrl} 
                            alt="Profile" 
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-blue-400 to-indigo-500 text-white font-semibold flex items-center justify-center text-xl">
                            {user?.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase() : 'U'}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-center gap-2">
                      <label className="cursor-pointer">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          disabled={uploadingProfileImage}
                          asChild
                        >
                          <span>
                            {uploadingProfileImage ? 'Uploading...' : 'Change Profile Picture'}
                          </span>
                        </Button>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              handleProfileImageUpload(file);
                            }
                          }}
                          className="hidden"
                          disabled={uploadingProfileImage}
                        />
                      </label>
                      {profileImageUrl && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => {
                            setProfileImageUrl('');
                            setProfileImage(null);
                          }}
                          className="text-red-600 hover:text-red-700"
                        >
                          Remove Picture
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Full Name</Label>
                      <Input 
                        value={editableName} 
                        onChange={(e) => setEditableName(e.target.value)}
                        placeholder="Enter your full name"
                      />
                    </div>
                    <div>
                      <Label>Email</Label>
                      <Input 
                        value={editableEmail} 
                        onChange={(e) => setEditableEmail(e.target.value)}
                        placeholder="Enter your email"
                        type="email"
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Phone Number</Label>
                      <Input 
                        placeholder="Enter your phone number" 
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>City</Label>
                      <Input 
                        placeholder="e.g., Mumbai, Delhi" 
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label>State/Province</Label>
                      <Input 
                        placeholder="e.g., Maharashtra, Karnataka" 
                        value={stateProvince}
                        onChange={(e) => setStateProvince(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Pincode</Label>
                      <Input 
                        placeholder="e.g., 400001" 
                        value={pincode}
                        onChange={(e) => setPincode(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Country</Label>
                      <Input 
                        placeholder="Country" 
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                      />
                    </div>
                  </div>
                  
                  <div>
                    <Label>Bio</Label>
                    <Textarea 
                      placeholder="Tell others about yourself..."
                      rows={4}
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                    />
                  </div>
                  
                  {/* Individual-specific fields */}
                  {user?.user_type === 'individual' && (
                    <div>
                      <Label>Age</Label>
                      <Input 
                        type="number"
                        min="18"
                        max="100"
                        placeholder="Enter your age"
                        value={age}
                        onChange={(e) => setAge(e.target.value)}
                      />
                    </div>
                  )}
                  
                  {/* Company-specific fields */}
                  {user?.user_type === 'company' && (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label>Industry</Label>
                          <Select value={industry} onValueChange={setIndustry}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select industry" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="technology">Technology</SelectItem>
                              <SelectItem value="healthcare">Healthcare</SelectItem>
                              <SelectItem value="education">Education</SelectItem>
                              <SelectItem value="manufacturing">Manufacturing</SelectItem>
                              <SelectItem value="finance">Finance & Banking</SelectItem>
                              <SelectItem value="retail">Retail</SelectItem>
                              <SelectItem value="consulting">Consulting</SelectItem>
                              <SelectItem value="media">Media & Entertainment</SelectItem>
                              <SelectItem value="energy">Energy</SelectItem>
                              <SelectItem value="ecommerce">E-commerce</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div>
                          <Label>Company Size</Label>
                          <Select value={companySize} onValueChange={setCompanySize}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select company size" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1-10">1-10 employees</SelectItem>
                              <SelectItem value="11-50">11-50 employees</SelectItem>
                              <SelectItem value="51-200">51-200 employees</SelectItem>
                              <SelectItem value="201-500">201-500 employees</SelectItem>
                              <SelectItem value="501-1000">501-1000 employees</SelectItem>
                              <SelectItem value="1001+">1001+ employees</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label>Website</Label>
                          <Input 
                            type="url"
                            placeholder="https://www.yourcompany.com"
                            value={website}
                            onChange={(e) => setWebsite(e.target.value)}
                          />
                        </div>
                        <div>
                          <Label>Sector</Label>
                          <Input 
                            placeholder="e.g., CSR, Education, Healthcare"
                            value={sector}
                            onChange={(e) => setSector(e.target.value)}
                          />
                        </div>
                      </div>

                      <div>
                        <Label>Founded Year</Label>
                        <Input 
                          type="number"
                          min="1800"
                          max={new Date().getFullYear()}
                          placeholder="e.g., 2010"
                          value={foundedYear}
                          onChange={(e) => setFoundedYear(e.target.value)}
                        />
                      </div>
                    </>
                  )}
                  
                  {/* NGO-specific fields */}
                  {user?.user_type === 'ngo' && (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label>NGO Size</Label>
                          <Select value={ngoSize} onValueChange={setNgoSize}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select NGO size" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1-10">1-10 members</SelectItem>
                              <SelectItem value="11-50">11-50 members</SelectItem>
                              <SelectItem value="51-200">51-200 members</SelectItem>
                              <SelectItem value="201-500">201-500 members</SelectItem>
                              <SelectItem value="501+">501+ members</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div>
                          <Label>Founded Year</Label>
                          <Input 
                            type="number"
                            min="1800"
                            max={new Date().getFullYear()}
                            placeholder="e.g., 2010"
                            value={foundedYear}
                            onChange={(e) => setFoundedYear(e.target.value)}
                          />
                        </div>
                      </div>
                      
                      <div>
                        <Label>Sector</Label>
                        <Input 
                          placeholder="Education, Healthcare, Environment, etc."
                          value={sector}
                          onChange={(e) => setSector(e.target.value)}
                        />
                      </div>
                    </>
                  )}
                  
                  <Button onClick={handleSaveProfile} disabled={loading}>
                    {loading ? 'Saving...' : 'Update Profile'}
                  </Button>
                </CardContent>
              </Card>

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
                    <div className="rounded-lg border p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Mobile Number Verification</span>
                        <VerificationBadge
                          status={resolvedPhoneVerified ? 'verified' : 'unverified'}
                          size="sm"
                          showText={false}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {(phone || user?.phone) ? `Phone: ${phone || user?.phone}` : 'Add a phone number in your profile settings.'}
                      </p>
                      {!resolvedPhoneVerified && (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full"
                            disabled
                          >
                            Verify Mobile Number
                          </Button>
                          {formErrors.phone && <p className="text-sm text-red-500">{formErrors.phone}</p>}
                          {otpSent.phone && <p className="text-sm text-green-600">OTP sent to your phone</p>}
                          {otpSent.phone && (
                            <div className="space-y-2">
                              <Label htmlFor="profilePhoneOtp">Phone OTP</Label>
                              <Input
                                id="profilePhoneOtp"
                                value={otpInput.phone}
                                onChange={(e) => setOtpInput((prev) => ({ ...prev, phone: e.target.value }))}
                                placeholder="Enter OTP"
                              />
                              <p className="text-xs text-muted-foreground">
                                Phone OTP verification API is pending. OTP send flow is active.
                              </p>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    <div className="rounded-lg border p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Email Verification</span>
                        <VerificationBadge
                          status={resolvedEmailVerified ? 'verified' : 'unverified'}
                          size="sm"
                          showText={false}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Email: {editableEmail || user?.email || 'No email found'}
                      </p>
                      {!resolvedEmailVerified && (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={() => handleSendEmailOtp(editableEmail || user?.email || '')}
                            disabled={otpSending.email || otpCooldown.email > 0}
                          >
                            {otpSending.email
                              ? 'Sending...'
                              : otpCooldown.email > 0
                                ? `Resend in ${otpCooldown.email}s`
                                : otpSent.email
                                  ? 'Resend OTP'
                                  : 'Verify Email'}
                          </Button>
                          {formErrors.email && <p className="text-sm text-red-500">{formErrors.email}</p>}
                          {otpSent.email && <p className="text-sm text-green-600">OTP sent to your email</p>}
                          {otpSent.email && (
                            <div className="space-y-2">
                              <Label htmlFor="profileEmailOtp">Email OTP</Label>
                              <div className="flex gap-2">
                                <Input
                                  id="profileEmailOtp"
                                  value={otpInput.email}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    setOtpInput((prev) => ({ ...prev, email: value }));
                                    if (formErrors.emailOtp) {
                                      setFormErrors((prev) => {
                                        const nextErrors = { ...prev };
                                        delete nextErrors.emailOtp;
                                        return nextErrors;
                                      });
                                    }
                                  }}
                                  placeholder="Enter OTP"
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={async () => {
                                    const verified = await handleVerifyEmailOtp(editableEmail || user?.email || '', otpInput.email);
                                    if (verified) {
                                      const verifiedAt = new Date().toISOString();
                                      const persistResponse = await fetch('/api/profile/update', {
                                        method: 'POST',
                                        headers: {
                                          'Content-Type': 'application/json'
                                        },
                                        body: JSON.stringify({
                                          userId: user?.id,
                                          email_verified: true,
                                          email_verified_at: verifiedAt
                                        })
                                      });

                                      if (!persistResponse.ok) {
                                        toast.error('Email OTP verified but failed to persist status. Please refresh and try again.');
                                        return;
                                      }

                                      updateUser({
                                        email: editableEmail || user?.email,
                                        email_verified: true,
                                        email_verified_at: verifiedAt
                                      });
                                      setProfile((prev: any) => ({
                                        ...(prev || {}),
                                        email_verified: true,
                                        email_verified_at: verifiedAt
                                      }));
                                      await fetchProfile();
                                      toast.success('Email verified successfully.');
                                    }
                                  }}
                                  disabled={otpVerifying.email}
                                >
                                  {otpVerifying.email ? 'Verifying...' : 'Verify OTP'}
                                </Button>
                              </div>
                              {formErrors.emailOtp && <p className="text-sm text-red-500">{formErrors.emailOtp}</p>}
                              {otpVerified.email && <p className="text-sm text-green-600">Email OTP verified</p>}
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    <div className="rounded-lg border p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Document Verification</span>
                        <VerificationBadge
                          status={resolvedVerificationStatus}
                          size="sm"
                          showText={false}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Complete identity verification from the verification dashboard.
                      </p>
                      {resolvedVerificationStatus !== 'verified' && (
                        <Link href={`/verification?userType=${user?.user_type}`} className="block">
                          <Button type="button" variant="default" size="sm" className="w-full">
                            Open Verification Dashboard
                          </Button>
                        </Link>
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
                  <Link href={`/profile/${user.id}`} className="block">
                    <Button variant="outline" size="sm" className="w-full justify-start">
                      <User className="h-4 w-4 mr-2" />
                      View Public Profile
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