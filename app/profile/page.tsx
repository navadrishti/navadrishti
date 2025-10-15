'use client'

import { useState, useEffect } from 'react'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { FileUpload } from '@/components/ui/file-upload'
import { useAuth } from '@/lib/auth-context'
import { UserCheck, Shield, Settings, User } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

export default function ProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [verificationData, setVerificationData] = useState<any>(null);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);
  const [projectPhotos, setProjectPhotos] = useState<File[]>([]);
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

  const handleProfileImageUpload = async (files: File[]) => {
    if (files.length === 0) {
      setProfileImageFile(null);
      setProfileImage(null);
      return;
    }

    const file = files[0];
    setProfileImageFile(file);
    
    // Create preview
    const imageUrl = URL.createObjectURL(file);
    setProfileImage(imageUrl);
    
    // Here you would typically upload to your server
    // For now, we'll just show a success message
    toast.success('Profile picture updated! Remember to save your changes.');
  };

  const handleProjectPhotosUpload = (files: File[]) => {
    setProjectPhotos(files);
    if (files.length > 0) {
      toast.success(`${files.length} project photo${files.length > 1 ? 's' : ''} selected!`);
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
      
      // Here you would typically save the profile data to your server
      // including uploading the profile image
      
      if (profileImageFile) {
        // In a real app, you'd upload the image to cloud storage
        console.log('Profile image to upload:', profileImageFile);
      }
      
      if (projectPhotos.length > 0) {
        // In a real app, you'd upload the project photos to cloud storage
        console.log('Project photos to upload:', projectPhotos.map(file => file.name));
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
                    <FileUpload
                      title="Upload your profile picture"
                      description="A clear photo that represents you professionally"
                      variant="profile"
                      maxSize={2}
                      recommendedSize="500KB recommended"
                      files={profileImageFile ? [profileImageFile] : []}
                      onFilesChange={handleProfileImageUpload}
                      allowedTypes={['image/jpeg', 'image/jpg', 'image/png', 'image/webp']}
                    />
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
                        <FileUpload
                          title="Upload your project photos"
                          description="Showcase your best work with high-quality images of completed projects"
                          multiple={true}
                          maxFiles={10}
                          maxSize={5}
                          recommendedSize="2MB per image recommended"
                          files={projectPhotos}
                          onFilesChange={handleProjectPhotosUpload}
                          allowedTypes={['image/jpeg', 'image/jpg', 'image/png', 'image/webp']}
                          dragText="Click to browse or drag and drop your project images"
                        />
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
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Email Verification</span>
                      <Badge variant={verificationData?.emailVerified || (user as any)?.verified_at ? "default" : "secondary"}>
                        {verificationData?.emailVerified || (user as any)?.verified_at ? "Verified" : "Pending"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Phone Verification</span>
                      <Badge variant={verificationData?.phoneVerified ? "default" : "secondary"}>
                        {verificationData?.phoneVerified ? "Verified" : "Pending"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Identity Verification</span>
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
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Organization Verification</span>
                        <Badge variant={verificationData?.organizationVerified ? "default" : "secondary"}>
                          {verificationData?.organizationVerified ? "Verified" : "Pending"}
                        </Badge>
                      </div>
                    )}
                    <Link href="/verification">
                      <Button variant="outline" size="sm" className="w-full">
                        <UserCheck className="h-4 w-4 mr-2" />
                        {verificationData?.verified ? "Manage Verification" : "Start Verification"}
                      </Button>
                    </Link>
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