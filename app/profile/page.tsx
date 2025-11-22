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
import { UserCheck, Shield, Settings, User, Award } from 'lucide-react'
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
  const [uploadingProfileImage, setUploadingProfileImage] = useState(false);
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
  
  // Individual-specific fields
  const [experience, setExperience] = useState('');
  const [proofOfWork, setProofOfWork] = useState<File[]>([]);
  const [resume, setResume] = useState<File | null>(null);
  const [proofOfWorkUrls, setProofOfWorkUrls] = useState<string[]>([]);
  const [resumeUrl, setResumeUrl] = useState('');
  
  // Organization details for NGOs
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [foundedYear, setFoundedYear] = useState('');
  const [focusAreas, setFocusAreas] = useState('');
  const [organizationWebsite, setOrganizationWebsite] = useState('');
  
  // Company details for companies
  const [industry, setIndustry] = useState('');
  const [companySize, setCompanySize] = useState('');
  const [companyWebsite, setCompanyWebsite] = useState('');
  
  // Individual specific fields
  const [age, setAge] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [editableEmail, setEditableEmail] = useState('');
  const [editableName, setEditableName] = useState('');
  const [ngoSize, setNgoSize] = useState('');

  useEffect(() => {
    if (user) {
      fetchProfile();
      fetchVerificationStatus();
    }
  }, [user]);

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
        proof_of_work: [],
        resume_url: '',
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
      setExperience(userProfile.experience || '');
      setProofOfWorkUrls(userProfile.work_photos || userProfile.proof_of_work || []);
      setResumeUrl(userProfile.resume_url || '');
      setRegistrationNumber(userProfile.registration_number || '');
      setFoundedYear(userProfile.founded_year || '');
      setFocusAreas(userProfile.focus_areas || '');
      setOrganizationWebsite(userProfile.organization_website || '');
      setIndustry(userProfile.industry || '');
      setCompanySize(userProfile.company_size || '');
      setCompanyWebsite(userProfile.company_website || '');
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
      
      const profileData: any = {
        userId: user?.id,
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
      if (bio !== undefined) profileData.bio = bio;
      
      // User type specific fields
      const profileDataFields: any = {};
      
      if (user?.user_type === 'individual') {
        if (age) profileDataFields.age = parseInt(age);
        if (proofOfWorkUrls.length > 0) profileDataFields.work_photos = proofOfWorkUrls;
        if (resumeUrl) profileDataFields.resume_url = resumeUrl;
      } else if (user?.user_type === 'company') {
        if (industry) profileDataFields.industry = industry;
        if (companySize) profileDataFields.company_size = companySize;
        if (companyWebsite) profileDataFields.company_website = companyWebsite;
        profileDataFields.company_name = editableName || user?.name;
      } else if (user?.user_type === 'ngo') {
        if (ngoSize) profileDataFields.ngo_size = ngoSize;
        if (organizationWebsite) profileDataFields.organization_website = organizationWebsite;
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

      if (!response.ok) {
        throw new Error('Failed to update profile');
      }

      await fetchProfile();
      toast.success('Profile saved successfully!');
    } catch (error) {
      console.error('Error saving profile:', error);
      toast.error('Failed to save profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProofOfWork = async () => {
    try {
      setUploading(true);
      
      if (!user?.id) {
        toast.error('User not authenticated');
        return;
      }

      const token = localStorage.getItem('token');
      if (!token) {
        toast.error('Authentication required');
        return;
      }

      // Upload new proof of work photos
      const uploadedPhotos = [];
      for (const file of proofOfWork) {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch('/api/upload', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData,
        });
        
        if (response.ok) {
          const result = await response.json();
          uploadedPhotos.push(result.data.url);
        } else {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          console.error('Upload error response:', errorData);
          throw new Error(errorData.error || 'Failed to upload proof of work photo');
        }
      }

      // Upload resume if provided
      let newResumeUrl = resumeUrl;
      if (resume) {
        const formData = new FormData();
        formData.append('file', resume);
        
        const response = await fetch('/api/upload', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData,
        });
        
        if (response.ok) {
          const result = await response.json();
          newResumeUrl = result.data.url;
        } else {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          console.error('Resume upload error:', errorData);
          throw new Error(errorData.error || 'Failed to upload resume');
        }
      }

      // Combine existing and new proof of work URLs
      const allProofOfWorkUrls = [...proofOfWorkUrls, ...uploadedPhotos];

      // Update user profile with new proof of work
      const profileData = {
        userId: user.id,
        profile_data: {
          work_photos: allProofOfWorkUrls,
          resume_url: newResumeUrl,
        }
      };

      const response = await fetch('/api/profile/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(profileData),
      });

      if (!response.ok) {
        throw new Error('Failed to update proof of work');
      }

      toast.success('Proof of work updated successfully!');

      // Reset form state and refresh profile
      setProofOfWork([]);
      setResume(null);
      await fetchProfile();

    } catch (error) {
      console.error('Error updating proof of work:', error);
      toast.error('Failed to update proof of work. Please try again.');
    } finally {
      setUploading(false);
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
                      
                      <div>
                        <Label>Company Website</Label>
                        <Input 
                          type="url"
                          placeholder="https://www.yourcompany.com"
                          value={companyWebsite}
                          onChange={(e) => setCompanyWebsite(e.target.value)}
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
                          <Label>Organization Website</Label>
                          <Input 
                            type="url"
                            placeholder="https://www.yourngo.org"
                            value={organizationWebsite}
                            onChange={(e) => setOrganizationWebsite(e.target.value)}
                          />
                        </div>
                      </div>
                    </>
                  )}
                  
                  <Button onClick={handleSaveProfile} disabled={loading}>
                    {loading ? 'Saving...' : 'Update Profile'}
                  </Button>
                </CardContent>
              </Card>

              {/* Individual-specific Experience & Proof of Work */}
              {user?.user_type === 'individual' && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Award className="h-5 w-5" />
                      Experience & Proof of Work
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label>Proof of Work Photos</Label>
                      <div className="space-y-4">
                        {/* Current work photos display */}
                        {proofOfWorkUrls.length > 0 && (
                          <div>
                            <p className="text-sm text-gray-600 mb-3">Current work photos:</p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                              {proofOfWorkUrls.map((url, index) => (
                                <div key={index} className="relative group">
                                  <img
                                    src={url}
                                    alt={`Work sample ${index + 1}`}
                                    className="w-full h-24 object-cover rounded-lg border-2 border-gray-200"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newUrls = proofOfWorkUrls.filter((_, i) => i !== index);
                                      setProofOfWorkUrls(newUrls);
                                    }}
                                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    <span className="text-xs">×</span>
                                  </button>
                                  <div className="absolute bottom-1 left-1 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded">
                                    {index + 1}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* New work photos upload */}
                        <div>
                          <p className="text-sm font-medium mb-2">Add new work photos:</p>
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={(e) => {
                              const files = Array.from(e.target.files || []);
                              setProofOfWork(files);
                            }}
                            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
                          />
                          
                          {/* Preview of new files */}
                          {proofOfWork.length > 0 && (
                            <div className="mt-3">
                              <p className="text-sm text-green-600 mb-2">✓ {proofOfWork.length} new photo{proofOfWork.length > 1 ? 's' : ''} selected</p>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {proofOfWork.map((file, index) => (
                                  <div key={index} className="relative group">
                                    <img
                                      src={URL.createObjectURL(file)}
                                      alt={`New work photo ${index + 1}`}
                                      className="w-full h-24 object-cover rounded-lg border-2 border-green-200"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newFiles = proofOfWork.filter((_, i) => i !== index);
                                        setProofOfWork(newFiles);
                                      }}
                                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                      <span className="text-xs">×</span>
                                    </button>
                                    <div className="absolute bottom-1 left-1 bg-green-600 bg-opacity-75 text-white text-xs px-2 py-1 rounded">
                                      New
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div>
                      <Label>Resume</Label>
                      <div className="space-y-2">
                        <input
                          type="file"
                          accept=".pdf,.doc,.docx"
                          onChange={(e) => {
                            const file = e.target.files?.[0] || null;
                            setResume(file);
                          }}
                          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                        />
                        {resumeUrl && (
                          <a 
                            href={resumeUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-700 underline text-sm block"
                          >
                            View Current Resume
                          </a>
                        )}
                        {resume && (
                          <p className="text-sm text-green-600">✓ New resume selected: {resume.name}</p>
                        )}
                      </div>
                    </div>
                    
                    <Button onClick={handleSaveProofOfWork} disabled={uploading}>
                      {uploading ? 'Uploading...' : 'Save Proof of Work'}
                    </Button>
                  </CardContent>
                </Card>
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
                    
                    {user?.phone && !user?.phone_verified && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Phone Verification</span>
                          <VerificationBadge 
                            status={user?.phone_verified ? 'verified' : 'unverified'} 
                            size="sm"
                          />
                        </div>
                        <PhoneVerificationSection 
                          phone={user.phone} 
                          onVerificationComplete={() => {
                            refreshUser();
                            fetchVerificationStatus();
                          }} 
                        />
                      </div>
                    )}
                    
                    {(!user?.verification_status || user?.verification_status === 'unverified') && (
                      <div className="pt-4 border-t">
                        <Link href={`/verification?userType=${user?.user_type}`} className="block">
                          <Button variant="default" size="sm" className="w-full">
                            <Shield className="h-4 w-4 mr-2" />
                            Get Verified
                          </Button>
                        </Link>
                      </div>
                    )}
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