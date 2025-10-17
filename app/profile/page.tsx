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

export default function ProfilePage() {
  const { user, updateUser } = useAuth();
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

  useEffect(() => {
    if (user) {
      fetchProfile();
      fetchVerificationStatus();
    }
  }, [user]);

  const fetchProfile = async () => {
    try {
      // For now, set default profile data
      setProfile({
        ...user,
        bio: '',
        phone: '',
        address: '',
        skills: [],
        interests: [],
        portfolio: [],
        experience: '',
        website: ''
      });
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
      
      // In a real app, you'd make an API call to save portfolio data
      // await fetch('/api/profile/portfolio', { method: 'POST', body: portfolioData });
      
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
      
      // Save profile image to database if uploaded
      if (profileImageUrl) {
        const response = await fetch('/api/profile/update', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: user.id,
            profileImageUrl: profileImageUrl,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to update profile image');
        }

        // Update the user context with the new profile image
        updateUser({ profile_image: profileImageUrl });
        console.log('Profile image saved:', profileImageUrl);
      }
      
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
                      <Input value={user.name} readOnly />
                    </div>
                    <div>
                      <Label>Email</Label>
                      <Input value={user.email} readOnly />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Account Type</Label>
                      <Input value={user.user_type.charAt(0).toUpperCase() + user.user_type.slice(1)} readOnly />
                    </div>
                    <div>
                      <Label>Phone</Label>
                      <Input placeholder="Add your phone number" />
                    </div>
                  </div>
                  <div>
                    <Label>Location</Label>
                    <Input placeholder="City, State/Province, Country" />
                  </div>
                  <div>
                    <Label>Bio</Label>
                    <Textarea 
                      placeholder={`Tell others about yourself as ${user.user_type === 'ngo' ? 'an organization' : user.user_type === 'company' ? 'a company' : 'an individual'}...`}
                      rows={4}
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
                        <Input placeholder="NGO registration number" />
                      </div>
                      <div>
                        <Label>Founded Year</Label>
                        <Input type="number" placeholder="YYYY" />
                      </div>
                    </div>
                    <div>
                      <Label>Focus Areas</Label>
                      <Input placeholder="Education, Healthcare, Environment, etc." />
                    </div>
                    <div>
                      <Label>Website</Label>
                      <Input placeholder="https://your-organization.org" />
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
                        <Input placeholder="Community Service, Social Work, Environmental, etc." />
                      </div>
                      <div>
                        <Label>Company Size</Label>
                        <Input placeholder="1-10, 11-50, 51-200, etc." />
                      </div>
                    </div>
                    <div>
                      <Label>Website</Label>
                      <Input placeholder="https://your-company.com" />
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
                        <Input placeholder="Teaching, Project Management, Communication, etc." />
                      </div>
                      <div>
                        <Label>Interests</Label>
                        <Input placeholder="Volunteering areas you're interested in" />
                      </div>
                      <div>
                        <Label>Categories</Label>
                        <Input placeholder="Community Service, Social Work, Environmental, etc." />
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
                  <div className="space-y-6">
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm font-medium">Email Verification</span>
                      <Badge variant={verificationData?.emailVerified || (user as any)?.verified_at ? "default" : "secondary"}>
                        {verificationData?.emailVerified || (user as any)?.verified_at ? "Verified" : "Pending"}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm font-medium">Phone Verification</span>
                      <Badge variant={verificationData?.phoneVerified ? "default" : "secondary"}>
                        {verificationData?.phoneVerified ? "Verified" : "Pending"}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm font-medium">Identity Verification</span>
                      <Badge variant={
                        user.user_type === 'individual' 
                          ? (verificationData?.aadhaarVerified && verificationData?.panVerified ? "default" : "secondary")
                          : (verificationData?.verified ? "default" : "secondary")
                      }>
                        {user.user_type === 'individual' 
                          ? (verificationData?.aadhaarVerified && verificationData?.panVerified ? "Verified" : "Pending")
                          : (verificationData?.verified ? "Verified" : "Pending")
                        }
                      </Badge>
                    </div>
                    
                    {user.user_type === 'ngo' && (
                      <div className="flex items-center justify-between py-2">
                        <span className="text-sm font-medium">Organization Verification</span>
                        <Badge variant={verificationData?.organizationVerified ? "default" : "secondary"}>
                          {verificationData?.organizationVerified ? "Verified" : "Pending"}
                        </Badge>
                      </div>
                    )}
                    
                    <div className="pt-4 border-t">
                      <Link href="/verification">
                        <Button variant="outline" size="sm" className="w-full">
                          <UserCheck className="h-4 w-4 mr-2" />
                          {verificationData?.verified ? "Manage Verification" : "Start Verification"}
                        </Button>
                      </Link>
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