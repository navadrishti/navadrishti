// Authentication context for client-side
'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { notify } from './notifications';

// Types
export interface User {
  id: number;
  email: string;
  name: string;
  user_type: 'individual' | 'ngo' | 'company';
  profile_image?: string;
  profile?: Record<string, any>;
  // Location fields for nearby functionality
  city?: string;
  state_province?: string;
  pincode?: string;
  country?: string;
  // Additional profile fields
  phone?: string;
  bio?: string;
  // Email verification
  email_verified?: boolean;
  email_verified_at?: string;
  // Phone verification
  phone_verified?: boolean;
  phone_verified_at?: string;
  // Document verification status
  verification_status?: 'verified' | 'unverified' | 'pending';
  verification_details?: any;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (userData: SignupData) => Promise<void>;
  logout: () => void;
  clearError: () => void;
  updateUser: (userData: Partial<User>) => void;
  refreshUser: () => Promise<void>;
}

interface SignupData {
  email: string;
  password: string;
  name: string;
  user_type: 'individual' | 'ngo' | 'company';
  profile_data?: Record<string, any>;
}

interface AuthProviderProps {
  children: ReactNode;
}

// Create context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Create provider
export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Load user from localStorage on initial render
  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    
    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
    }
    
    setLoading(false);
  }, []);

  // Verify token and fetch current user
  useEffect(() => {
    const verifyTokenAsync = async () => {
      if (!token) return;
      
      try {
        const response = await fetch('/api/auth/me', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          setUser(data.user);
          // Update localStorage with fresh user data
          localStorage.setItem('user', JSON.stringify(data.user));
        } else if (response.status === 401) {
          // Token is invalid, expired, or has signature issues
          notify.error('Your session has expired. Please log in again.');
          logout();
        } else {
          // Other error, but still clear auth to be safe
          notify.error('Authentication error. Please log in again.');
          logout();
        }
      } catch (error) {
        notify.error('Connection error. Please check your internet connection.');
        logout();
      }
    };
    
    if (token) {
      verifyTokenAsync();
    }
  }, [token]);

  // Login function
  const login = async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        const errorMessage = data.error || 'Login failed';
        setError(errorMessage);
        notify.error(errorMessage);
        return;
      }
      
      // Save token and user to state and localStorage
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      
      notify.success(`Welcome back, ${data.user.name}!`);
    } catch (error: any) {
      const errorMessage = error.message || 'An error occurred during login';
      setError(errorMessage);
      notify.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Signup function
  const signup = async (userData: SignupData) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(userData)
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        const errorMessage = data.error || 'Signup failed';
        setError(errorMessage);
        notify.error(errorMessage);
        return;
      }
      
      // Save token and user to state and localStorage
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      
      notify.success(`Welcome to Navdrishti, ${data.user.name}!`);
    } catch (error: any) {
      const errorMessage = error.message || 'An error occurred during signup';
      setError(errorMessage);
      notify.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Logout function
  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    notify.info('You have been logged out');
  };

  // Clear error
  const clearError = () => {
    setError(null);
  };

  // Update user data
  const updateUser = (userData: Partial<User>) => {
    if (user) {
      const updatedUser = { ...user, ...userData };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
    }
  };

  // Refresh user data from server
  const refreshUser = async () => {
    if (!token) return;
    
    try {
      const response = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        localStorage.setItem('user', JSON.stringify(data.user));
      } else {
        notify.error('Failed to refresh user data');
      }
    } catch (error) {
      notify.error('Failed to refresh user data');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        error,
        login,
        signup,
        logout,
        clearError,
        updateUser,
        refreshUser
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook to use auth context
export function useAuth() {
  const context = useContext(AuthContext);
  
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
}