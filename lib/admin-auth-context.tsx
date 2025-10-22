// Admin Authentication Context
// Production-ready admin authentication with role-based access control

'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface AdminUser {
  id: number;
  email: string;
  name: string;
  role: string;
  permissions: string[];
  lastLogin: string;
}

interface AdminAuthContextType {
  adminUser: AdminUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  refreshSession: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Check if user has specific permission
  const hasPermission = (permission: string): boolean => {
    if (!adminUser) return false;
    if (adminUser.role === 'super_admin') return true;
    return adminUser.permissions.includes(permission);
  };

  // Login function
  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (data.success) {
        // Store session token in httpOnly cookie (handled by API)
        setAdminUser(data.adminUser);
        router.push('/admin');
        return { success: true };
      } else {
        return { success: false, error: data.error || 'Login failed' };
      }
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Network error occurred' };
    }
  };

  // Logout function
  const logout = async (): Promise<void> => {
    try {
      await fetch('/api/admin/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setAdminUser(null);
      router.push('/admin/login');
    }
  };

  // Refresh session
  const refreshSession = async (): Promise<void> => {
    try {
      const response = await fetch('/api/admin/auth/verify', {
        method: 'GET',
        credentials: 'include',
      });

      const data = await response.json();

      if (data.success) {
        setAdminUser(data.adminUser);
      } else {
        setAdminUser(null);
        if (window.location.pathname.startsWith('/admin') && window.location.pathname !== '/admin/login') {
          router.push('/admin/login');
        }
      }
    } catch (error) {
      console.error('Session refresh error:', error);
      setAdminUser(null);
    } finally {
      setLoading(false);
    }
  };

  // Initialize session on mount
  useEffect(() => {
    refreshSession();
  }, []);

  // Auto-refresh session every 15 minutes
  useEffect(() => {
    if (adminUser) {
      const interval = setInterval(refreshSession, 15 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [adminUser]);

  const value: AdminAuthContextType = {
    adminUser,
    loading,
    login,
    logout,
    hasPermission,
    refreshSession,
  };

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (context === undefined) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  }
  return context;
}

// Higher-order component for protecting admin routes
export function withAdminAuth<P extends object>(Component: React.ComponentType<P>) {
  return function AdminProtectedComponent(props: P) {
    const { adminUser, loading } = useAdminAuth();
    const router = useRouter();

    useEffect(() => {
      if (!loading && !adminUser) {
        router.push('/admin/login');
      }
    }, [adminUser, loading, router]);

    if (loading) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      );
    }

    if (!adminUser) {
      return null;
    }

    return <Component {...props} />;
  };
}

// Permission-based component wrapper
export function AdminPermissionGate({ 
  permission, 
  children, 
  fallback = null 
}: { 
  permission: string; 
  children: React.ReactNode; 
  fallback?: React.ReactNode;
}) {
  const { hasPermission } = useAdminAuth();

  if (!hasPermission(permission)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}