// Authentication context for client-side
'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// Types
export interface User {
  id: number;
  email: string;
  name: string;
  user_type: 'individual' | 'ngo' | 'company';
  profile_image?: string;
  profile?: Record<string, any>;
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
      
      console.log('Verifying token...', { token: token.substring(0, 20) + '...' });
      
      try {
        const response = await fetch('/api/auth/me', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        console.log('Token verification response:', { status: response.status, ok: response.ok });
        
        if (response.ok) {
          const data = await response.json();
          console.log('Token verification successful:', data);
          setUser(data.user);
          // Update localStorage with fresh user data
          localStorage.setItem('user', JSON.stringify(data.user));
        } else if (response.status === 401) {
          // Token is invalid, expired, or has signature issues
          console.log('Invalid token detected, clearing authentication...');
          logout();
        } else {
          // Other error, but still clear auth to be safe
          console.log('Other error during token verification:', response.status);
          const errorData = await response.json();
          console.log('Error data:', errorData);
          logout();
        }
      } catch (error) {
        console.error('Failed to verify token:', error);
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
      console.log('Attempting login for:', email);
      
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });
      
      const data = await response.json();
      console.log('Login response:', { status: response.status, ok: response.ok, data });
      
      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }
      
      // Save token and user to state and localStorage
      console.log('Setting token and user...', { token: data.token.substring(0, 20) + '...', user: data.user });
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      
      console.log('Login successful!');
    } catch (error: any) {
      console.error('Login error:', error);
      setError(error.message || 'An error occurred during login');
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
        throw new Error(data.error || 'Signup failed');
      }
      
      // Save token and user to state and localStorage
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
    } catch (error: any) {
      setError(error.message || 'An error occurred during signup');
      console.error('Signup error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Logout function
  const logout = () => {
    console.log('Logout called!');
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
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
        updateUser
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