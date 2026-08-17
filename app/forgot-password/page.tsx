'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle } from 'lucide-react';
import { AuthCardBackRow } from '@/components/header';
import { useOtpSender } from '@/hooks/use-otp-sender';

type Step = 'email' | 'otp' | 'password' | 'success';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const { otpSending, otpSent, otpCooldown, handleSendPasswordResetEmailOtp, resetEmailOtpState } =
    useOtpSender(setFormErrors);

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [accountName, setAccountName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSendOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError('');

    const sent = await handleSendPasswordResetEmailOtp(email);
    if (sent) {
      setStep('otp');
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!otp.trim()) {
      setError('Please enter the OTP sent to your email');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/verify-reset-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), otp: otp.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Invalid OTP');
        return;
      }

      setResetToken(data.resetToken);
      setAccountName(data.accountName || email.trim());
      setStep('password');
    } catch {
      setError('An error occurred. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          resetToken,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to reset password');
        return;
      }

      setStep('success');
      setTimeout(() => {
        router.push('/login');
      }, 3000);
    } catch {
      setError('An error occurred. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'success') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-r from-blue-50 to-indigo-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <AuthCardBackRow fallbackHref="/login" />
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <CardTitle className="text-center text-2xl font-bold text-green-600">
                Password Reset Successful
              </CardTitle>
              <CardDescription className="text-center">
                Your password has been updated. You can now sign in with your new password.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="text-center text-sm text-muted-foreground">
            <p>Redirecting to sign in page...</p>
          </CardContent>

          <CardFooter>
            <Link href="/login" className="w-full">
              <Button className="w-full">Sign In Now</Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-r from-blue-50 to-indigo-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <AuthCardBackRow fallbackHref="/login" />
          <CardTitle className="text-center text-2xl font-bold">Forgot Password</CardTitle>
          <CardDescription className="text-center">
            {step === 'email' && 'Enter your registered email to receive a one-time password'}
            {step === 'otp' && `Enter the OTP sent to ${email}`}
            {step === 'password' && `Set a new password for ${accountName}`}
          </CardDescription>
        </CardHeader>

        {step === 'email' && (
          <form onSubmit={handleSendOtp}>
            <CardContent className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Registered Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="example@email.com"
                  value={email}
                  onChange={(e) => {
                    if (e.target.value !== email) {
                      resetEmailOtpState();
                      setStep('email');
                    }
                    setEmail(e.target.value);
                  }}
                  required
                />
                {formErrors.email && <p className="text-sm text-red-500">{formErrors.email}</p>}
              </div>
            </CardContent>

            <CardFooter className="flex flex-col space-y-4">
              <Button type="submit" className="w-full" disabled={otpSending.email}>
                {otpSending.email ? 'Sending OTP...' : 'Send OTP'}
              </Button>

              <div className="text-center text-sm">
                <Link href="/register" className="font-medium text-primary hover:underline">
                  Create Account
                </Link>
              </div>
            </CardFooter>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={handleVerifyOtp}>
            <CardContent className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {otpSent.email && (
                <Alert>
                  <AlertDescription>
                    If an account exists for this email, an OTP has been sent. Check your inbox and spam folder.
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="otp">Email OTP</Label>
                <Input
                  id="otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="Enter 6-digit OTP"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  required
                />
                {formErrors.emailOtp && <p className="text-sm text-red-500">{formErrors.emailOtp}</p>}
              </div>
            </CardContent>

            <CardFooter className="flex flex-col space-y-4">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Verifying...' : 'Verify OTP'}
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={loading || otpSending.email || otpCooldown.email > 0}
                onClick={() => handleSendOtp()}
              >
                {otpSending.email
                  ? 'Sending OTP...'
                  : otpCooldown.email > 0
                    ? `Resend OTP in ${otpCooldown.email}s`
                    : 'Resend OTP'}
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setStep('email');
                  setOtp('');
                  setError('');
                  resetEmailOtpState();
                }}
              >
                Use a different email
              </Button>
            </CardFooter>
          </form>
        )}

        {step === 'password' && (
          <form onSubmit={handleResetPassword}>
            <CardContent className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter new password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
                <p className="text-xs text-muted-foreground">
                  Password must be at least 8 characters long
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
            </CardContent>

            <CardFooter className="flex flex-col space-y-4">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Updating Password...' : 'Update Password'}
              </Button>

              <div className="text-center text-sm">
                Remember your password?{' '}
                <Link href="/login" className="font-medium text-primary hover:underline">
                  Sign In
                </Link>
              </div>
            </CardFooter>
          </form>
        )}
      </Card>
    </div>
  );
}
