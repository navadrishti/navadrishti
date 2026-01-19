/**
 * Protected Route Components with Access Control
 * 
 * Exports:
 * - ProtectedRoute: Basic protection with user type restrictions
 * - EnhancedProtectedRoute: Advanced protection with permissions and verification
 * - PermissionGate: Component-level permission checking
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { smoothNavigate } from '@/lib/smooth-navigation';
import { 
  getUserPermissions, 
  hasPermission, 
  getPermissionErrorMessage, 
  canAccessRoute, 
  getRedirectPathForUserType,
  type AccessPermissions 
} from '@/lib/access-control';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, AlertTriangle, ArrowRight } from 'lucide-react';
import Link from 'next/link';

// Shared skeleton loader component
function PageSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-8 animate-fadeIn">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="h-16 bg-white dark:bg-slate-800 rounded-lg shadow-sm animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-4">
            <div className="h-64 bg-white dark:bg-slate-800 rounded-lg shadow-sm animate-pulse" />
            <div className="h-48 bg-white dark:bg-slate-800 rounded-lg shadow-sm animate-pulse" />
          </div>
          <div className="space-y-4">
            <div className="h-32 bg-white dark:bg-slate-800 rounded-lg shadow-sm animate-pulse" />
            <div className="h-32 bg-white dark:bg-slate-800 rounded-lg shadow-sm animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}

interface BasicProtectedRouteProps {
  children: React.ReactNode;
  userTypes?: ('individual' | 'ngo' | 'company')[];
}

/**
 * Basic protected route with user type restrictions and smooth transitions
 */
export function ProtectedRoute({ children, userTypes }: BasicProtectedRouteProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      setIsRedirecting(true);
      const timer = setTimeout(() => {
        smoothNavigate(router, '/login', { delay: 150 });
      }, 150);
      return () => clearTimeout(timer);
    }

    if (userTypes && userTypes.length > 0) {
      if (!userTypes.includes(user.user_type)) {
        setIsRedirecting(true);
        const timer = setTimeout(() => {
          smoothNavigate(router, '/', { delay: 150 });
        }, 150);
        return () => clearTimeout(timer);
      }
    }
  }, [user, loading, router, userTypes]);

  if (loading || !user || isRedirecting) {
    return <PageSkeleton />;
  }

  if (userTypes && userTypes.length > 0 && !userTypes.includes(user.user_type)) {
    return <PageSkeleton />;
  }

  return <>{children}</>;
}

interface PermissionGateProps {
  children: React.ReactNode;
  permission: keyof AccessPermissions;
  fallback?: React.ReactNode;
  showError?: boolean;
}

/**
 * Component that conditionally renders content based on user permissions
 */
export function PermissionGate({ 
  children, 
  permission, 
  fallback = null, 
  showError = true 
}: PermissionGateProps) {
  const { user } = useAuth();
  
  if (hasPermission(user, permission)) {
    return <>{children}</>;
  }
  
  if (fallback) {
    return <>{fallback}</>;
  }
  
  if (!showError) {
    return null;
  }
  
  const errorMessage = getPermissionErrorMessage(permission, user);
  
  return (
    <Alert variant="destructive" className="my-4">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription>{errorMessage}</AlertDescription>
    </Alert>
  );
}

interface ProtectedRouteProps {
  children: React.ReactNode;
  userTypes?: ('individual' | 'ngo' | 'company')[];
  requireVerification?: boolean;
  permission?: keyof AccessPermissions;
}

/**
 * Enhanced protected route component with comprehensive access control
 */
export default function ProtectedRoute({ 
  children, 
  userTypes,
  requireVerification = false,
  permission
}: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || loading) return;

    // If no user is logged in, redirect to login
    if (!user) {
      smoothNavigate(router, '/login', { delay: 150 });
      return;
    }

    // Check user type restrictions
    if (userTypes && userTypes.length > 0) {
      if (!userTypes.includes(user.user_type)) {
        // Redirect to appropriate dashboard for user type
        const redirectPath = getRedirectPathForUserType(user.user_type);
        smoothNavigate(router, redirectPath, { delay: 150 });
        return;
      }
    }

    // Check verification requirements
    if (requireVerification && user.verification_status !== 'verified') {
      smoothNavigate(router, '/verification', { delay: 150 });
      return;
    }

    // Check specific permission if provided
    if (permission && !hasPermission(user, permission)) {
      // Stay on page but show error - handled by render logic below
      return;
    }

    // Check route-specific access
    const currentPath = window.location.pathname;
    if (!canAccessRoute(user.user_type, currentPath)) {
      const redirectPath = getRedirectPathForUserType(user.user_type);
      smoothNavigate(router, redirectPath, { delay: 150 });
      return;
    }
  }, [user, loading, router, userTypes, requireVerification, permission, mounted]);

  // Show loading state with skeleton
  if (!mounted || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-8 animate-fadeIn">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="h-16 bg-white dark:bg-slate-800 rounded-lg shadow-sm animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-4">
              <div className="h-64 bg-white dark:bg-slate-800 rounded-lg shadow-sm animate-pulse" />
              <div className="h-48 bg-white dark:bg-slate-800 rounded-lg shadow-sm animate-pulse" />
            </div>
            <div className="space-y-4">
              <div className="h-32 bg-white dark:bg-slate-800 rounded-lg shadow-sm animate-pulse" />
              <div className="h-32 bg-white dark:bg-slate-800 rounded-lg shadow-sm animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show login prompt if not authenticated
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Shield className="mx-auto h-12 w-12 text-muted-foreground" />
            <CardTitle>Sign In Required</CardTitle>
            <CardDescription>
              Please sign in to access this page
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/login">
              <Button className="w-full">
                Sign In
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Check user type restrictions
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

  // Check verification requirements
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

  // Check specific permission
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