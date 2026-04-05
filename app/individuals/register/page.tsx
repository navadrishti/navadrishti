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
import { useOtpSender } from '@/hooks/use-otp-sender';

import { toast } from 'sonner';
import { MapPin } from 'lucide-react';

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
  const { otpSending, otpSent, otpCooldown, otpVerifying, otpVerified, handleSendEmailOtp, handleVerifyEmailOtp, handleSendPhoneOtp, resetEmailOtpState } = useOtpSender(setFormErrors);
  const [otpInput, setOtpInput] = useState({ email: '', phone: '' });
  const { signup, error, loading, clearError } = useAuth();
  const router = useRouter();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;

    if (name === 'email' && value !== formData.email) {
      resetEmailOtpState();
      setOtpInput(prev => ({ ...prev, email: '' }));
    }

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
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Clear previous errors
    clearError();
    
    // Validate form
    if (!validateForm()) {
      return;
    }

    if (!otpSent.email) {
      setFormErrors(prev => ({ ...prev, emailOtp: 'Please send email OTP first' }));
      return;
    }

    if (!otpVerified.email && !otpInput.email.trim()) {
      setFormErrors(prev => ({ ...prev, emailOtp: 'Please enter email OTP' }));
      return;
    }

    if (!otpVerified.email) {
      const emailOtpVerified = await handleVerifyEmailOtp(formData.email, otpInput.email);
      if (!emailOtpVerified) {
        return;
      }
    }
    
    try {
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
          age: parseInt(formData.age)
        }
      };
      
      // Call signup function from auth context
      await signup(userData);

      toast.success('Account created successfully!');
      router.push('/individuals/dashboard');
    } catch {
      // Error state and user notification are handled in auth context
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
                <div className="flex gap-2">
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="john@example.com"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleSendEmailOtp(formData.email)}
                    disabled={otpSending.email || otpCooldown.email > 0}
                  >
                    {otpSending.email ? 'Sending...' : otpCooldown.email > 0 ? `Resend in ${otpCooldown.email}s` : 'Send OTP'}
                  </Button>
                </div>
                {formErrors.email && <p className="text-sm text-red-500">{formErrors.email}</p>}
                {otpSent.email && <p className="text-sm text-green-600">OTP sent to your email</p>}
                {otpSent.email && (
                  <div className="space-y-2">
                    <Label htmlFor="emailOtp">Email OTP</Label>
                    <div className="flex gap-2">
                      <Input
                        id="emailOtp"
                        name="emailOtp"
                        value={otpInput.email}
                        onChange={(e) => {
                          const value = e.target.value;
                          setOtpInput(prev => ({ ...prev, email: value }));
                          if (formErrors.emailOtp) {
                            setFormErrors(prev => {
                              const nextErrors = { ...prev };
                              delete nextErrors.emailOtp;
                              return nextErrors;
                            });
                          }
                        }}
                        placeholder="Enter email OTP"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleVerifyEmailOtp(formData.email, otpInput.email)}
                        disabled={otpVerifying.email}
                      >
                        {otpVerifying.email ? 'Verifying...' : 'Verify OTP'}
                      </Button>
                    </div>
                    {formErrors.emailOtp && <p className="text-sm text-red-500">{formErrors.emailOtp}</p>}
                    {otpVerified.email && <p className="text-sm text-green-600">Email OTP verified</p>}
                  </div>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <div className="flex gap-2">
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="+91 9876543210"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleSendPhoneOtp(formData.phone)}
                    disabled={otpSending.phone || otpCooldown.phone > 0}
                  >
                    {otpSending.phone ? 'Sending...' : otpCooldown.phone > 0 ? `Resend in ${otpCooldown.phone}s` : 'Send OTP'}
                  </Button>
                </div>
                {formErrors.phone && <p className="text-sm text-red-500">{formErrors.phone}</p>}
                {otpSent.phone && <p className="text-sm text-green-600">OTP sent to your phone</p>}
                {otpSent.phone && (
                  <div className="space-y-2">
                    <Label htmlFor="phoneOtp">Phone OTP</Label>
                    <Input
                      id="phoneOtp"
                      name="phoneOtp"
                      value={otpInput.phone}
                      onChange={(e) => setOtpInput(prev => ({ ...prev, phone: e.target.value }))}
                      placeholder="Enter phone OTP"
                    />
                  </div>
                )}
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
                  <Label htmlFor="pincode">Pincode</Label>
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
            
          </CardContent>
          
          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" className="w-full" disabled={loading || !otpVerified.email}>
              {loading ? 'Creating Account...' : 'Create Account'}
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