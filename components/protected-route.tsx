'use client';

import { useEffect } from 'react'
import { useIsClient } from '@/hooks/use-is-client'
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { smoothNavigate } from '@/lib/utils';
import { 
  hasPermission, 
  getPermissionErrorMessage, 
  canAccessRoute, 
  getRedirectPathForUserType,
  type AccessPermissions 
} from '@/lib/access-control';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, AlertTriangle, ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { DashboardPageSkeleton } from '@/components/ui/skeleton';

function PageSkeleton({ userType }: { userType?: string }) {
  return <DashboardPageSkeleton userType={userType} />;
}

interface ProtectedRouteProps {
  children: React.ReactNode;
  userTypes?: ('individual' | 'ngo' | 'company')[];
  requireVerification?: boolean;
  permission?: keyof AccessPermissions;
}

export default function ProtectedRoute({ 
  children, 
  userTypes,
  requireVerification = false,
  permission
}: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const mounted = useIsClient();

  useEffect(() => {
    if (!mounted || loading) return;

    if (!user) {
      smoothNavigate(router, '/', { delay: 0 });
      return;
    }

    if (userTypes && userTypes.length > 0) {
      if (!userTypes.includes(user.user_type)) {
        // Redirect to appropriate dashboard for user type
        const redirectPath = getRedirectPathForUserType(user.user_type);
        smoothNavigate(router, redirectPath, { delay: 150 });
        return;
      }
    }

    if (requireVerification && user.verification_status !== 'verified') {
      smoothNavigate(router, '/verification', { delay: 150 });
      return;
    }

    if (permission && !hasPermission(user, permission)) {
      // Stay on page but show error - handled by render logic below
      return;
    }

    const currentPath = window.location.pathname;
    if (!canAccessRoute(user.user_type, currentPath)) {
      const redirectPath = getRedirectPathForUserType(user.user_type);
      smoothNavigate(router, redirectPath, { delay: 150 });
      return;
    }
  }, [user, loading, router, userTypes, requireVerification, permission, mounted]);

  if (!mounted || loading) {
    return <PageSkeleton userType={user?.user_type || userTypes?.[0]} />;
  }

  // Redirecting unauthenticated visitors to home
  if (!user) {
    return <PageSkeleton userType={userTypes?.[0]} />;
  }

  if (userTypes && userTypes.length > 0 && !userTypes.includes(user.user_type)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
            <CardTitle>Access Restricted</CardTitle>
            <CardDescription>
              This page is only available to {userTypes.join(', ')} accounts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href={getRedirectPathForUserType(user.user_type)}>
              <Button variant="outline" className="w-full">
                Go to Dashboard
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (requireVerification && user.verification_status !== 'verified') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Shield className="mx-auto h-12 w-12 text-yellow-500" />
            <CardTitle>Verification Required</CardTitle>
            <CardDescription>
              Please complete your account verification to access this page
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/verification">
              <Button className="w-full">
                Complete Verification
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (permission && !hasPermission(user, permission)) {
    const errorMessage = getPermissionErrorMessage(permission, user);
    
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center">
            <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
            <CardTitle>Permission Denied</CardTitle>
            <CardDescription>
              {errorMessage}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {user.verification_status !== 'verified' && (
              <Link href="/verification">
                <Button className="w-full">
                  Complete Verification
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            )}
            <Link href={getRedirectPathForUserType(user.user_type)}>
              <Button variant="outline" className="w-full">
                Go to Dashboard
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // All checks passed, render the protected content
  return <>{children}</>;
}