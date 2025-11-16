'use client'

import React from 'react'
import { useState, useEffect } from 'react'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
      setProofOfWorkUrls(userProfile.proof_of_work || []);
      setResumeUrl(userProfile.resume_url || '');
      setRegistrationNumber(userProfile.registration_number || '');
      setFoundedYear(userProfile.founded_year || '');
      setFocusAreas(userProfile.focus_areas || '');
      setOrganizationWebsite(userProfile.organization_website || '');
      setIndustry(userProfile.industry || '');
      setCompanySize(userProfile.company_size || '');
      setCompanyWebsite(userProfile.company_website || '');
      
      // Load profile image if available
      if (freshUser?.profile_image) {
        setProfileImageUrl(freshUser.profile_image);
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

  const handleSaveProfile = async () => {
    try {
      setLoading(true);
      
      const profileData: any = {
        userId: user?.id,
      };
      
      if (profileImageUrl) {
        profileData.profileImageUrl = profileImageUrl;
      }
      
      if (city?.trim()) profileData.city = city.trim();
      if (stateProvince?.trim()) profileData.state_province = stateProvince.trim();
      if (pincode?.trim()) profileData.pincode = pincode.trim();
      if (country?.trim()) profileData.country = country.trim();
      if (phone?.trim()) profileData.phone = phone.trim();
      if (bio?.trim()) profileData.bio = bio.trim();
      
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

      // Upload proof of work photos to Cloudinary
      const uploadedPhotos = [];
      for (const file of proofOfWork) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', 'udaan-collective');
        
        const response = await fetch('https://api.cloudinary.com/v1_1/dgevlmwpt/image/upload', {
          method: 'POST',
          body: formData,
        });
        
        if (response.ok) {
          const result = await response.json();
          uploadedPhotos.push(result.secure_url);
        } else {
          throw new Error('Failed to upload proof of work photo');
        }
      }

      // Upload resume to Cloudinary if provided
      let newResumeUrl = resumeUrl;
      if (resume) {
        const formData = new FormData();
        formData.append('file', resume);
        formData.append('upload_preset', 'udaan-collective');
        formData.append('resource_type', 'raw'); // For PDF/doc files
        
        const response = await fetch('https://api.cloudinary.com/v1_1/dgevlmwpt/raw/upload', {
          method: 'POST',
          body: formData,
        });
        
        if (response.ok) {
          const result = await response.json();
          newResumeUrl = result.secure_url;
        } else {
          throw new Error('Failed to upload resume');
        }
      }

      // Combine existing and new proof of work URLs
      const allProofOfWorkUrls = [...proofOfWorkUrls, ...uploadedPhotos];

      // Update user profile with new experience and proof of work
      const profileData = {
        userId: user.id,
        experience: experience,
        proof_of_work: allProofOfWorkUrls,
        resume_url: newResumeUrl,
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

      toast.success('Experience and proof of work updated successfully!');

      // Reset form state and refresh profile
      setProofOfWork([]);
      setResume(null);
      await fetchProfile();

    } catch (error) {
      console.error('Error updating proof of work:', error);
      toast.error('Failed to update experience and proof of work. Please try again.');
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Full Name</Label>
                      <Input value={user.name || 'Please update your name'} readOnly />
                    </div>
                    <div>
                      <Label>Email</Label>
                      <Input value={user.email} readOnly />
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
                      <Label>Experience</Label>
                      <Textarea 
                        placeholder="Describe your professional experience..."
                        rows={4}
                        value={experience}
                        onChange={(e) => setExperience(e.target.value)}
                      />
                    </div>
                    
                    <div>
                      <Label>Proof of Work Photos</Label>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={(e) => {
                              const files = Array.from(e.target.files || []);
                              setProofOfWork(files);
                            }}
                            className="text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                          />
                        </div>
                        {proofOfWorkUrls.length > 0 && (
                          <div className="grid grid-cols-3 gap-2 mt-2">
                            {proofOfWorkUrls.map((url, index) => (
                              <img
                                key={index}
                                src={url}
                                alt={`Work sample ${index + 1}`}
                                className="w-full h-20 object-cover rounded"
                              />
                            ))}
                          </div>
                        )}
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
                          className="text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
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
                      </div>
                    </div>
                    
                    <Button onClick={handleSaveProofOfWork} disabled={uploading}>
                      {uploading ? 'Uploading...' : 'Save Experience & Work'}
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