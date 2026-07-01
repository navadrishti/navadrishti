// Authentication context for client-side
'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
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
  initialUser?: User | null;
  initialToken?: string | null;
}

// Create context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

const getFriendlySignupErrorMessage = (data: any, status: number) => {
  const rawError = data?.error;

  if (typeof rawError === 'string' && rawError.trim().length > 0) {
    return rawError;
  }

  if (Array.isArray(rawError) && rawError.length > 0) {
    const firstItem = rawError[0];
    if (typeof firstItem === 'string') {
      return firstItem;
    }
    if (firstItem?.message) {
      return firstItem.message;
    }
  }

  if (status === 400) {
    return 'Please check your details and try again.';
  }

  if (status === 409) {
    return 'An account with this email already exists. Please log in or use a different email.';
  }

  if (status >= 500) {
    return 'We could not create your account right now. Please try again in a moment.';
  }

  return 'Unable to create account. Please try again.';
};

// Create provider
export function AuthProvider({ children, initialUser = null, initialToken = null }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(initialUser);
  const [token, setToken] = useState<string | null>(initialToken);
  const [loading, setLoading] = useState<boolean>(!initialUser && !initialToken);
  const [error, setError] = useState<string | null>(null);
  const initialUserRef = useRef<User | null>(initialUser);

  const persistAuthSnapshot = useCallback((nextToken: string | null, nextUser: User | null) => {
    if (nextToken) {
      localStorage.setItem('token', nextToken);
      sessionStorage.setItem('token', nextToken);
    } else {
      localStorage.removeItem('token');
      sessionStorage.removeItem('token');
    }

    if (nextUser) {
      const serializedUser = JSON.stringify(nextUser);
      localStorage.setItem('user', serializedUser);
      sessionStorage.setItem('user', serializedUser);
    } else {
      localStorage.removeItem('user');
      sessionStorage.removeItem('user');
    }
  }, []);

  const persistUserSnapshot = useCallback((nextUser: User | null) => {
    if (nextUser) {
      const serializedUser = JSON.stringify(nextUser);
      localStorage.setItem('user', serializedUser);
      sessionStorage.setItem('user', serializedUser);
    } else {
      localStorage.removeItem('user');
      sessionStorage.removeItem('user');
    }
  }, []);

  const hydrateUserFromServer = useCallback(async (authToken: string, fallbackUser?: User | null) => {
    try {
      const response = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        persistAuthSnapshot(authToken, data.user);
        return data.user as User;
      }

      if (response.status === 401) {
        persistAuthSnapshot(null, null);
        setToken(null);
        setUser(null);
        return null;
      }
    } catch (err) {
      console.error('User hydration error:', err);
    }

    if (fallbackUser) {
      setUser(fallbackUser);
      persistAuthSnapshot(authToken, fallbackUser);
      return fallbackUser;
    }

    return null;
  }, [persistAuthSnapshot]);

  const hydrateUserFromCookie = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        persistUserSnapshot(data.user);
        return data.user as User;
      }
    } catch (err) {
      console.error('Cookie hydration error:', err);
    }

    return null;
  }, []);

  const syncAuthFromStorage = useCallback(async () => {
    try {
      setLoading(true);

      const storedToken = sessionStorage.getItem('token') || localStorage.getItem('token') || token;
      const storedUser = sessionStorage.getItem('user') || localStorage.getItem('user');

      if (storedToken && storedToken !== 'undefined' && storedToken !== 'null') {
        const cleanToken = storedToken.replace(/["']/g, '').trim();

        if (!cleanToken || cleanToken === 'undefined' || cleanToken === 'null') {
          persistAuthSnapshot(null, null);
          setToken(null);
          setUser(null);
          setLoading(false);
          return;
        }

        setToken(cleanToken);

        if (storedUser && storedUser !== 'undefined' && storedUser !== 'null') {
          try {
            const parsedUser = JSON.parse(storedUser);
            setUser(parsedUser);
          } catch (parseError) {
            console.error('Error parsing stored user:', parseError);
          }
        }

        const hydratedUser = await hydrateUserFromServer(cleanToken);
        if (!hydratedUser) {
          setToken(null);
          setUser(null);
        }
        setLoading(false);
        return;
      }

      const cookieUser = await hydrateUserFromCookie();
      if (cookieUser) {
        setLoading(false);
        return;
      }

      setUser(initialUserRef.current);
      setLoading(false);
    } catch (error) {
      console.error('Error syncing auth state:', error);
      setLoading(false);
    }
  }, [hydrateUserFromCookie, hydrateUserFromServer, token]);

  // Load user from localStorage on initial render
  useEffect(() => {
    syncAuthFromStorage();
  }, []);

  // Verify token and fetch current user
  useEffect(() => {
    const verifyTokenAsync = async () => {
      if (!token) return;
      
      try {
        // Clean token before sending
        const cleanToken = token.replace(/[\"']/g, '').trim();
        
        if (!cleanToken || cleanToken.length === 0) {
          console.error('Token is empty after cleaning');
          setLoading(false);
          return;
        }

        const response = await fetch('/api/auth/me', {
          headers: {
            'Authorization': `Bearer ${cleanToken}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          setUser(data.user);
          // Update localStorage with fresh user data
          persistAuthSnapshot(cleanToken, data.user);
        } else if (response.status === 401) {
          setToken(null);
          setUser(null);
          persistAuthSnapshot(null, null);
        } else {
          console.error('Token verification failed with status:', response.status);
        }
      } catch (error) {
        console.error('Token verification error:', error);
      } finally {
        setLoading(false);
      }
    };
    
    if (token) {
      verifyTokenAsync();
    }
  }, [hydrateUserFromCookie, persistAuthSnapshot, token]);

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
      persistAuthSnapshot(data.token, null);

      await hydrateUserFromServer(data.token, data.user);
      
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
        const errorMessage = getFriendlySignupErrorMessage(data, response.status);
        setError(errorMessage);
        notify.error(errorMessage);
        const handledError = new Error(errorMessage) as Error & { handled?: boolean };
        handledError.handled = true;
        throw handledError;
      }
      
      // Save token and user to state and localStorage
      setToken(data.token);
      persistAuthSnapshot(data.token, null);

      await hydrateUserFromServer(data.token, data.user);
      
      notify.success(`Welcome to Navadrishti, ${data.user.name}!`);
    } catch (error: any) {
      if (error?.handled) {
        throw error;
      }

      const errorMessage = error?.message?.trim()
        ? error.message
        : 'Unable to create account right now. Please try again.';
      setError(errorMessage);
      notify.error(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Logout function
  const logout = () => {
    setToken(null);
    setUser(null);
    setError(null);
    
    // Clear all auth-related data from storage
    persistAuthSnapshot(null, null);
    initialUserRef.current = null;
    
    // Clear auth cookies if they exist
    document.cookie = 'token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    document.cookie = 'user=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    
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
      persistAuthSnapshot(token, updatedUser);
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
        persistAuthSnapshot(token, data.user);
      } else if (response.status === 401) {
        setToken(null);
        setUser(null);
        persistAuthSnapshot(null, null);
      } else {
        notify.error('Failed to refresh user data');
      }
    } catch (error) {
      notify.error('Failed to refresh user data');
    }
  };

  // Rehydrate only on cross-tab storage changes
  useEffect(() => {
    const rehydrateHandler = () => {
      void syncAuthFromStorage();
    };

    const storageListener = (e: StorageEvent) => {
      if (e.key === 'token' || e.key === 'user') {
        rehydrateHandler();
      }
    };

    window.addEventListener('storage', storageListener);

    return () => {
      window.removeEventListener('storage', storageListener);
    };
  }, [syncAuthFromStorage]);

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