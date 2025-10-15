'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

interface ProtectedRouteProps {
  children: React.ReactNode;
  userTypes?: ('individual' | 'ngo' | 'company')[];
}

export default function ProtectedRoute({ children, userTypes }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Check if authentication is still loading
    if (loading) return;

    // If no user is logged in, redirect to login
    if (!user) {
      router.push('/login');
      return;
    }

    // If userTypes is specified, check if the current user type is allowed
    if (userTypes && userTypes.length > 0) {
      if (!userTypes.includes(user.user_type)) {
        // User is not of the required type, redirect to home or dashboard
        router.push('/');
      }
    }
  }, [user, loading, router, userTypes]);

  // Show nothing while loading or redirecting
  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin h-12 w-12 rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  // If userTypes is specified and user is not of required type, show nothing
  if (userTypes && userTypes.length > 0 && !userTypes.includes(user.user_type)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Unauthorized</h1>
          <p className="mt-2 text-gray-500">You don't have permission to access this page.</p>
        </div>
      </div>
    );
  }

  // Otherwise, render the children
  return <>{children}</>;
}