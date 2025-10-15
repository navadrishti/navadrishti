"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Camera, Upload, CheckCircle, Clock, AlertCircle, FileText, User, Phone, CreditCard, Users, Briefcase, Award, Save, Send, UserCheck, FileCheck } from "lucide-react"
import { Header } from "@/components/header"
import { FileUpload } from "@/components/ui/file-upload"
import { useAuth } from '@/lib/auth-context'
import { toast } from 'sonner'
import ProtectedRoute from '@/components/protected-route'

function VerifyPeopleContent() {
  const { user, token } = useAuth();
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    ngoAffiliation: '',
    age: '',
    contactNumber: '',
    aadharCard: '',
    skillset: '',
    pastWork: '',
    experience: ''
  });
  
  const [profilePicture, setProfilePicture] = useState<File | null>(null);
  const [workPhotos, setWorkPhotos] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  // Real data state
  const [pendingVerifications, setPendingVerifications] = useState<any[]>([]);
  const [verifiedMembers, setVerifiedMembers] = useState<any[]>([]);
  const [availableNGOs, setAvailableNGOs] = useState<any[]>([]);

  // Fetch all data on component mount
  useEffect(() => {
    if (user && user.user_type === 'ngo' && token) {
      fetchVerificationData();
      fetchNGOList();
    }
  }, [user, token]);

  const fetchVerificationData = async () => {
    try {
      setLoadingData(true);
      
      // Fetch pending verifications
      const pendingResponse = await fetch('/api/skills/verify?status=pending_digilocker', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      // Fetch verified members
      const verifiedResponse = await fetch('/api/skills/verify?status=verified', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (pendingResponse.ok && verifiedResponse.ok) {
        const pendingData = await pendingResponse.json();
        const verifiedData = await verifiedResponse.json();
        
        setPendingVerifications(pendingData.records || []);
        setVerifiedMembers(verifiedData.records || []);
      } else {
        toast.error('Failed to load verification data');
      }
    } catch (error) {
      console.error('Error fetching verification data:', error);
      toast.error('Failed to load verification data');
    } finally {
      setLoadingData(false);
    }
  };

  const fetchNGOList = async () => {
    try {
      const response = await fetch('/api/ngos/list');
      if (response.ok) {
        const data = await response.json();
        setAvailableNGOs(data.ngos || []);
      }
    } catch (error) {
      console.error('Error fetching NGO list:', error);
    }
  };

  // Handle form input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Handle NGO selection
  const handleNGOChange = (value: string) => {
    setFormData(prev => ({
      ...prev,
      ngoAffiliation: value
    }));
  };



  // Save form as draft
  const handleSaveForm = async () => {
    if (!formData.name || !formData.contactNumber || !formData.aadharCard) {
      toast.error('Please fill in required fields (Name, Contact Number, Aadhaar Card)');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/skills/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...formData,
          profilePicture: profilePicture?.name || null,
          workPhotos: workPhotos.map(file => file.name),
          isDraft: true
        })
      });

      if (response.ok) {
        toast.success('Form saved as draft successfully!');
        resetForm();
        fetchVerificationData();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to save form');
      }
    } catch (error) {
      toast.error('Failed to save form');
    } finally {
      setLoading(false);
    }
  };

  // Submit form for verification
  const handleSubmitForm = async () => {
    if (!formData.name || !formData.contactNumber || !formData.aadharCard) {
      toast.error('Please fill in all required fields');
      return;
    }

    // Validate Aadhaar format (12 digits)
    if (!/^\d{12}$/.test(formData.aadharCard)) {
      toast.error('Please enter a valid 12-digit Aadhaar number');
      return;
    }

    // Validate contact number format
    if (!/^\d{10}$/.test(formData.contactNumber)) {
      toast.error('Please enter a valid 10-digit contact number');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/skills/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...formData,
          profilePicture: profilePicture?.name || null,
          workPhotos: workPhotos.map(file => file.name),
          isDraft: false
        })
      });

      if (response.ok) {
        toast.success('Form submitted for verification successfully! DigiLocker verification will be processed soon.');
        resetForm();
        fetchVerificationData();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to submit form');
      }
    } catch (error) {
      toast.error('Failed to submit form');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      ngoAffiliation: '',
      age: '',
      contactNumber: '',
      aadharCard: '',
      skillset: '',
      pastWork: '',
      experience: ''
    });
    setProfilePicture(null);
    setWorkPhotos([]);
  };

  // Check if user is NGO
  if (user && user.user_type !== 'ngo') {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 px-6 py-8 md:px-10">
          <div className="text-center py-20">
            <AlertCircle className="h-16 w-16 mx-auto mb-4 text-gray-400" />
            <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
            <p className="text-muted-foreground">
              Only NGOs can access the people verification system.
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      
      <main className="flex-1 px-6 py-8 md:px-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Verify People</h1>
          <p className="text-muted-foreground">
            Verify and manage skilled individuals in your community
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* New Verification Form - Left Column */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserCheck className="h-5 w-5" />
                  New Person Verification
                </CardTitle>
                <CardDescription>
                  Add a new person for skill verification and DigiLocker authentication
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="name">Full Name *</Label>
                    <Input
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      placeholder="Enter full name"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="ngoAffiliation">NGO Affiliation *</Label>
                    <Select value={formData.ngoAffiliation} onValueChange={handleNGOChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select NGO" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableNGOs.map((ngo) => (
                          <SelectItem key={ngo.id} value={ngo.name}>
                            {ngo.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="age">Age</Label>
                    <Input
                      id="age"
                      name="age"
                      type="number"
                      value={formData.age}
                      onChange={handleInputChange}
                      placeholder="Enter age"
                      min="18"
                      max="80"
                    />
                  </div>
                  <div>
                    <Label htmlFor="contactNumber">Contact Number *</Label>
                    <Input
                      id="contactNumber"
                      name="contactNumber"
                      value={formData.contactNumber}
                      onChange={handleInputChange}
                      placeholder="Enter mobile number"
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="aadharCard">Aadhar Card Number *</Label>
                  <Input
                    id="aadharCard"
                    name="aadharCard"
                    value={formData.aadharCard}
                    onChange={handleInputChange}
                    placeholder="Enter 12-digit Aadhar number"
                    maxLength={12}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="profilePicture">Profile Picture *</Label>
                  <FileUpload
                    title="Upload profile picture"
                    description="A clear photo of the person for verification"
                    variant="profile"
                    maxSize={2}
                    recommendedSize="500KB recommended"
                    files={profilePicture ? [profilePicture] : []}
                    onFilesChange={(files) => setProfilePicture(files[0] || null)}
                    allowedTypes={['image/jpeg', 'image/jpg', 'image/png', 'image/webp']}
                  />
                </div>

                <div>
                  <Label htmlFor="skillset">Skillset</Label>
                  <Textarea
                    id="skillset"
                    name="skillset"
                    value={formData.skillset}
                    onChange={handleInputChange}
                    placeholder="List skills separated by commas (e.g., Teaching, Project Management, Communication)"
                    rows={3}
                  />
                </div>

                <div>
                  <Label htmlFor="pastWork">Past Work Experience</Label>
                  <Textarea
                    id="pastWork"
                    name="pastWork"
                    value={formData.pastWork}
                    onChange={handleInputChange}
                    placeholder="Describe previous work experience and projects"
                    rows={4}
                  />
                </div>

                <div>
                  <Label htmlFor="experience">Years of Experience</Label>
                  <Input
                    id="experience"
                    name="experience"
                    value={formData.experience}
                    onChange={handleInputChange}
                    placeholder="e.g., 2 years in project management, 1 year in training"
                  />
                </div>

                <div>
                  <Label htmlFor="workPhotos">Work Portfolio/Project Photos (Optional)</Label>
                  <FileUpload
                    title="Upload work samples"
                    description="Photos showcasing previous work or skills demonstration"
                    multiple={true}
                    maxFiles={5}
                    maxSize={3}
                    recommendedSize="1MB per image"
                    files={workPhotos}
                    onFilesChange={setWorkPhotos}
                    allowedTypes={['image/jpeg', 'image/jpg', 'image/png', 'image/webp']}
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <Button onClick={handleSaveForm} variant="outline" className="flex-1">
                    <Save className="h-4 w-4 mr-2" />
                    Save as Draft
                  </Button>
                  <Button 
                    onClick={handleSubmitForm} 
                    disabled={loading}
                    className="flex-1"
                  >
                    <Send className="h-4 w-4 mr-2" />
                    {loading ? 'Submitting...' : 'Submit for Verification'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Pending Verifications Section */}
            <Card className="mt-8">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Pending Verifications ({pendingVerifications.length})
                </CardTitle>
                <CardDescription>
                  People waiting for DigiLocker verification
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingData ? (
                  <div className="space-y-4">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="flex items-center gap-4 p-4 border rounded-lg animate-pulse">
                        <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
                        <div className="flex-1">
                          <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                          <div className="h-3 bg-gray-200 rounded w-1/3"></div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {pendingVerifications.map((person) => (
                      <div key={person.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center gap-4">
                          <Avatar>
                            <AvatarFallback>{person.name.charAt(0).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div>
                            <h4 className="font-semibold">{person.name}</h4>
                            <p className="text-sm text-muted-foreground">{person.ngo_affiliation}</p>
                            <p className="text-sm text-muted-foreground">{person.skillset}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge variant="secondary" className="mb-2">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Pending DigiLocker
                          </Badge>
                          <p className="text-xs text-muted-foreground">
                            Submitted: {new Date(person.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    ))}
                    {pendingVerifications.length === 0 && !loadingData && (
                      <div className="text-center py-8 text-muted-foreground">
                        <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No pending verifications</p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Verified Members List - Right Column */}
          <div>
            <Card className="sticky top-8">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5" />
                  Verified Members ({verifiedMembers.length})
                </CardTitle>
                <CardDescription>
                  Successfully verified skilled individuals
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingData ? (
                  <div className="space-y-4 max-h-[600px] overflow-y-auto">
                    {[...Array(2)].map((_, i) => (
                      <div key={i} className="p-4 border rounded-lg animate-pulse">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
                          <div className="flex-1">
                            <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                            <div className="h-3 bg-gray-200 rounded w-1/3 mb-2"></div>
                            <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4 max-h-[600px] overflow-y-auto">
                    {verifiedMembers.map((member) => (
                      <div key={member.id} className="p-4 border rounded-lg">
                        <div className="flex items-start gap-3">
                          <Avatar>
                            <AvatarFallback>{member.name.charAt(0).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <h4 className="font-semibold text-sm">{member.name}</h4>
                            <p className="text-xs text-muted-foreground mb-2">{member.ngo_affiliation}</p>
                            <p className="text-xs text-muted-foreground mb-2">{member.skillset}</p>
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="default" className="text-xs">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Verified
                              </Badge>
                              {member.rating > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  ⭐ {member.rating.toFixed(1)}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {member.completed_projects || 0} projects completed
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Verified: {member.verified_at ? new Date(member.verified_at).toLocaleDateString() : 'Recently'}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                    {verifiedMembers.length === 0 && !loadingData && (
                      <div className="text-center py-8 text-muted-foreground">
                        <UserCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No verified members yet</p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function VerifyPeople() {
  return (
    <ProtectedRoute>
      <VerifyPeopleContent />
    </ProtectedRoute>
  );
}