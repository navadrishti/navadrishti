'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { toast } from 'sonner';
import { Upload, FileText, Image, X, User, MapPin, Camera } from 'lucide-react';

export default function IndividualRegister() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    age: '',
    city: '',
    state: '',
    pincode: '',
    country: 'India'
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [workPhotos, setWorkPhotos] = useState<File[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<{
    resume?: string;
    workPhotos: string[];
  }>({ workPhotos: [] });
  const [uploading, setUploading] = useState(false);
  const { signup, error, loading, clearError } = useAuth();
  const router = useRouter();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // Clear error for this field when user starts typing
    if (formErrors[name]) {
      setFormErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    
    if (formErrors[name]) {
      setFormErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    
    if (!formData.name.trim()) {
      errors.name = 'Name is required';
    }
    
    if (!formData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      errors.email = 'Email is invalid';
    }
    
    if (!formData.phone.trim()) {
      errors.phone = 'Phone number is required';
    } else if (!/^[+]?[1-9]\d{1,14}$/.test(formData.phone.replace(/\s+/g, ''))) {
      errors.phone = 'Please enter a valid phone number';
    }
    
    if (!formData.password) {
      errors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    }
    
    if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }
    
    if (!formData.age) {
      errors.age = 'Age is required';
    } else if (parseInt(formData.age) < 18 || parseInt(formData.age) > 100) {
      errors.age = 'Age must be between 18 and 100';
    }
    
    if (!formData.city.trim()) {
      errors.city = 'City is required';
    }
    
    if (!formData.state.trim()) {
      errors.state = 'State/Province is required';
    }
    
    // Validate that at least one file (resume or work photos) is provided
    if (!resumeFile && workPhotos.length === 0) {
      errors.files = 'Please upload either a resume or work photos to proceed';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const uploadFileToCloudinary = async (file: File, folder: string = 'individuals') => {
    console.log('uploadFileToCloudinary called:', { fileName: file.name, fileType: file.type, fileSize: file.size, folder });
    
    const formData = new FormData();
    formData.append('file', file);
    
    // Try to get token, but don't require it during registration
    const token = localStorage.getItem('token');
    const headers: any = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      console.log('Using auth token for upload');
    } else {
      console.log('No auth token available, uploading anonymously');
    }

    console.log('Making upload request to /api/upload...');
    const response = await fetch('/api/upload', {
      method: 'POST',
      headers,
      body: formData
    });

    console.log('Upload response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response' }));
      console.error('Upload failed with error:', errorData);
      throw new Error(errorData.error || 'Upload failed');
    }

    const result = await response.json();
    console.log('Upload successful:', result);
    return result.data.url;
  };

  const validateFile = (file: File, type: 'resume' | 'image') => {
    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('File too large. Maximum size is 10MB.');
    }
    
    if (type === 'resume') {
      const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      if (!allowedTypes.includes(file.type)) {
        throw new Error('Only PDF, DOC, and DOCX files are allowed for resume.');
      }
    } else if (type === 'image') {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        throw new Error('Only JPEG, PNG, GIF, and WebP images are allowed.');
      }
    }
    
    return true;
  };

  const handleResumeUpload = async (file: File) => {
    try {
      validateFile(file, 'resume');
      setResumeFile(file);
      toast.success(`Resume selected: ${file.name}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Invalid file selected');
    }
  };

  const handleWorkPhotosUpload = (files: File[]) => {
    try {
      if (workPhotos.length + files.length > 5) {
        toast.error('Maximum 5 work photos allowed');
        return;
      }
      
      // Validate each file
      const validFiles = [];
      for (const file of files) {
        try {
          validateFile(file, 'image');
          validFiles.push(file);
        } catch (error) {
          toast.error(`${file.name}: ${error instanceof Error ? error.message : 'Invalid file'}`);
        }
      }
      
      if (validFiles.length > 0) {
        setWorkPhotos(prev => [...prev, ...validFiles]);
        toast.success(`${validFiles.length} work photo${validFiles.length > 1 ? 's' : ''} added!`);
      }
    } catch (error) {
      toast.error('Error processing files');
    }
  };

  const removeWorkPhoto = (index: number) => {
    setWorkPhotos(prev => prev.filter((_, i) => i !== index));
    toast.success('Photo removed');
  };

  const uploadAllFiles = async () => {
    setUploading(true);
    const uploadedUrls: { resume?: string; workPhotos: string[] } = { workPhotos: [] };
    
    try {
      console.log('Starting file uploads...', { resumeFile: !!resumeFile, workPhotosCount: workPhotos.length });
      
      // Upload resume if provided
      if (resumeFile) {
        console.log('Uploading resume:', resumeFile.name, resumeFile.type, resumeFile.size);
        const resumeUrl = await uploadFileToCloudinary(resumeFile, 'individuals/resumes');
        uploadedUrls.resume = resumeUrl;
        console.log('Resume uploaded successfully:', resumeUrl);
      }
      
      // Upload work photos
      if (workPhotos.length > 0) {
        console.log('Uploading work photos:', workPhotos.map(p => ({ name: p.name, type: p.type, size: p.size })));
        const photoUrls = await Promise.all(
          workPhotos.map((photo, index) => {
            console.log(`Uploading photo ${index + 1}:`, photo.name);
            return uploadFileToCloudinary(photo, 'individuals/work-photos');
          })
        );
        uploadedUrls.workPhotos = photoUrls;
        console.log('Work photos uploaded successfully:', photoUrls);
      }
      
      setUploadedFiles(uploadedUrls);
      toast.success('Files uploaded successfully!');
      console.log('All files uploaded:', uploadedUrls);
      return uploadedUrls;
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(`Failed to upload files: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Clear previous errors
    clearError();
    
    // Validate form
    if (!validateForm()) {
      return;
    }
    
    try {
      // Upload files first if any are selected
      let fileUrls = uploadedFiles;
      if ((resumeFile || workPhotos.length > 0) && (!uploadedFiles.resume && uploadedFiles.workPhotos.length === 0)) {
        fileUrls = await uploadAllFiles();
      }
      
      // Prepare user data for signup
      const userData = {
        email: formData.email,
        password: formData.password,
        name: formData.name,
        user_type: 'individual' as const,
        phone: formData.phone,
        city: formData.city,
        state_province: formData.state,
        pincode: formData.pincode,
        country: formData.country,
        profile_data: {
          age: parseInt(formData.age),
          resume_url: fileUrls.resume,
          work_photos: fileUrls.workPhotos
        }
      };
      
      // Call signup function from auth context
      await signup(userData);
      
      // If signup is successful, redirect to dashboard
      if (!error) {
        toast.success('Account created successfully!');
        router.push('/individuals/dashboard');
      }
    } catch (uploadError) {
      toast.error('Failed to create account. Please try again.');
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-r from-blue-50 to-indigo-50 p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">Register as Individual</CardTitle>
          <CardDescription className="text-center">
            Create your account to connect with NGOs and companies
          </CardDescription>
        </CardHeader>
        
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="John Doe"
                />
                {formErrors.name && <p className="text-sm text-red-500">{formErrors.name}</p>}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="john@example.com"
                />
                {formErrors.email && <p className="text-sm text-red-500">{formErrors.email}</p>}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="+91 9876543210"
                />
                {formErrors.phone && <p className="text-sm text-red-500">{formErrors.phone}</p>}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="age">Age</Label>
                <Input
                  id="age"
                  name="age"
                  type="number"
                  min="18"
                  max="100"
                  value={formData.age}
                  onChange={handleChange}
                  placeholder="25"
                />
                {formErrors.age && <p className="text-sm text-red-500">{formErrors.age}</p>}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  value={formData.password}
                  onChange={handleChange}
                />
                {formErrors.password && <p className="text-sm text-red-500">{formErrors.password}</p>}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                />
                {formErrors.confirmPassword && (
                  <p className="text-sm text-red-500">{formErrors.confirmPassword}</p>
                )}
              </div>
            </div>
            
            {/* Location Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Location Information
              </h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    placeholder="Mumbai, Delhi, etc."
                  />
                  {formErrors.city && <p className="text-sm text-red-500">{formErrors.city}</p>}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="state">State/Province</Label>
                  <Input
                    id="state"
                    name="state"
                    value={formData.state}
                    onChange={handleChange}
                    placeholder="Maharashtra, Delhi, etc."
                  />
                  {formErrors.state && <p className="text-sm text-red-500">{formErrors.state}</p>}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="pincode">Pincode (Optional)</Label>
                  <Input
                    id="pincode"
                    name="pincode"
                    value={formData.pincode}
                    onChange={handleChange}
                    placeholder="400001"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <Select value={formData.country} onValueChange={(value) => handleSelectChange('country', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="India">India</SelectItem>
                      <SelectItem value="Bangladesh">Bangladesh</SelectItem>
                      <SelectItem value="Nepal">Nepal</SelectItem>
                      <SelectItem value="Sri Lanka">Sri Lanka</SelectItem>
                      <SelectItem value="Pakistan">Pakistan</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            
            {/* Resume & Portfolio - MANDATORY */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Resume & Portfolio - Required
              </h3>
              
              {formErrors.files && (
                <Alert variant="destructive">
                  <AlertDescription>{formErrors.files}</AlertDescription>
                </Alert>
              )}
              
              <div className="space-y-2">
                <Label>Resume (PDF) - Upload at least resume OR work photos</Label>
                <div className="flex flex-col space-y-2">
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleResumeUpload(e.target.files[0]);
                      }
                    }}
                    disabled={loading || uploading}
                  />
                  <p className="text-sm text-gray-600">Upload your resume to showcase your qualifications</p>
                  {resumeFile && (
                    <div className="flex items-center gap-2 text-sm text-green-600">
                      <FileText className="h-4 w-4" />
                      ✓ {resumeFile.name}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Work Photos - Upload at least resume OR work photos (Max 5 images)</Label>
                <div className="flex flex-col space-y-2">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
                    onChange={(e) => {
                      if (e.target.files) {
                        handleWorkPhotosUpload(Array.from(e.target.files));
                      }
                    }}
                    disabled={loading || uploading || workPhotos.length >= 5}
                  />
                  <p className="text-sm text-gray-600">Share photos of your work, projects, or achievements</p>
                  
                  {workPhotos.length > 0 && (
                    <div className="mt-4">
                      <p className="text-sm text-green-600 mb-3">✓ {workPhotos.length} work photo{workPhotos.length > 1 ? 's' : ''} selected</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {workPhotos.map((file, index) => (
                          <div key={index} className="relative group">
                            <img
                              src={URL.createObjectURL(file)}
                              alt={`Work photo ${index + 1}`}
                              className="h-24 w-full object-cover rounded-lg border-2 border-gray-200"
                            />
                            <button
                              type="button"
                              onClick={() => removeWorkPhoto(index)}
                              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                              disabled={loading || uploading}
                            >
                              <X className="h-3 w-3" />
                            </button>
                            <div className="absolute bottom-1 left-1 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded">
                              {index + 1}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
          
          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" className="w-full" disabled={loading || uploading}>
              {uploading ? 'Uploading Files...' : loading ? 'Creating Account...' : 'Create Account'}
            </Button>
            
            <div className="text-center text-sm">
              Already have an account?{' '}
              <Link href="/login" className="font-medium text-primary hover:underline">
                Sign in
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}