// Authentication context for client-side
'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from './notifications';
import { getDocumentExpiryAlertCopy } from './auth';
import { PRODUCT_NAME } from './access-control';

const DOCUMENT_EXPIRY_ALERT_DURATION_MS = 18000;
const documentExpiryAlertKey = (userId: number) => `navadrishti:document-expiry-alert:${userId}`;

function notifyDocumentExpiryForUser(user: User) {
  if (typeof window === 'undefined' || user.user_type !== 'ngo') return;

  const key = documentExpiryAlertKey(user.id);
  if (sessionStorage.getItem(key)) return;

  const copy = getDocumentExpiryAlertCopy(user.profile_data || user.profile);
  if (!copy) return;

  sessionStorage.setItem(key, '1');
  window.setTimeout(() => {
    notify.info(copy.title, copy.description, DOCUMENT_EXPIRY_ALERT_DURATION_MS);
  }, 800);
}

// Types
export interface User {
  id: number;
  email: string;
  name: string;
  user_type: 'individual' | 'ngo' | 'company';
  profile_image?: string;
  cover_image?: string;
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
  verification_status?: 'verified' | 'unverified' | 'pending' | 'suspended';
  ca_badge_number?: string | null;
  csr_eligible?: boolean;
  ca_compliance_tags?: string[];
  verification_details?: any;
  profile_data?: Record<string, any>;
  document_expiry_summary?: {
    has_expired: boolean;
    has_due_soon: boolean;
  } | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (userData: SignupData) => Promise<void>;
  logout: () => void | Promise<void>;
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

const isInvalidAuthResponse = (status: number) => status === 401 || status === 404;

// Create provider
export function AuthProvider({ children, initialUser = null, initialToken = null }: AuthProviderProps) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(initialUser);
  const [token, setToken] = useState<string | null>(initialToken);
  const [loading, setLoading] = useState<boolean>(!initialUser && !initialToken);
  const [error, setError] = useState<string | null>(null);
  const initialUserRef = useRef<User | null>(initialUser);
  // Bumped on logout so in-flight /me hydrations and Strict Mode remounts cannot revive the session.
  const authEpochRef = useRef(0);

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
    const epoch = authEpochRef.current;
    try {
      const response = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      if (epoch !== authEpochRef.current) return null;

      if (response.ok) {
        const data = await response.json();
        if (!data?.user?.id || Number(data.user.id) <= 0) {
          persistAuthSnapshot(null, null);
          setToken(null);
          setUser(null);
          return null;
        }
        setUser(data.user);
        persistAuthSnapshot(authToken, data.user);
        return data.user as User;
      }

      if (isInvalidAuthResponse(response.status)) {
        persistAuthSnapshot(null, null);
        setToken(null);
        setUser(null);
        return null;
      }
    } catch (err) {
      console.error('User hydration error:', err);
    }

    if (epoch !== authEpochRef.current) return null;

    if (fallbackUser) {
      setUser(fallbackUser);
      persistAuthSnapshot(authToken, fallbackUser);
      return fallbackUser;
    }

    return null;
  }, [persistAuthSnapshot]);

  const hydrateUserFromCookie = useCallback(async () => {
    const epoch = authEpochRef.current;
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'include'
      });

      if (epoch !== authEpochRef.current) return null;

      if (response.ok) {
        const data = await response.json();
        if (!data?.user?.id || Number(data.user.id) <= 0) {
          return null;
        }
        setUser(data.user);
        persistUserSnapshot(data.user);
        return data.user as User;
      }
    } catch (err) {
      console.error('Cookie hydration error:', err);
    }

    return null;
  }, [persistUserSnapshot]);

  const syncAuthFromStorage = useCallback(async () => {
    const epoch = authEpochRef.current;
    try {
      setLoading(true);

      // Never fall back to React state/props here — after logout, Strict Mode / Fast Refresh
      // can remount with a stale SSR initialToken even though storage + cookie were cleared.
      const storedToken = sessionStorage.getItem('token') || localStorage.getItem('token');
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
        if (epoch !== authEpochRef.current) return;
        if (!hydratedUser) {
          setToken(null);
          setUser(null);
        }
        setLoading(false);
        return;
      }

      const cookieUser = await hydrateUserFromCookie();
      if (epoch !== authEpochRef.current) return;
      if (cookieUser) {
        setLoading(false);
        return;
      }

      // No storage and no live cookie — force logged-out, ignore stale SSR initial* props.
      setToken(null);
      setUser(null);
      initialUserRef.current = null;
      setLoading(false);
    } catch (error) {
      console.error('Error syncing auth state:', error);
      setLoading(false);
    }
  }, [hydrateUserFromCookie, hydrateUserFromServer, persistAuthSnapshot]);

  // Load user from localStorage on initial render
  useEffect(() => {
    syncAuthFromStorage();
  }, []);

  useEffect(() => {
    if (loading || !user) return;
    notifyDocumentExpiryForUser(user);
  }, [loading, user]);

  // Verify token and fetch current user
  useEffect(() => {
    const verifyTokenAsync = async () => {
      if (!token) return;
      const epoch = authEpochRef.current;
      
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

        if (epoch !== authEpochRef.current) return;
        
        if (response.ok) {
          const data = await response.json();
          setUser(data.user);
          // Update localStorage with fresh user data
          persistAuthSnapshot(cleanToken, data.user);
        } else if (isInvalidAuthResponse(response.status)) {
          setToken(null);
          setUser(null);
          persistAuthSnapshot(null, null);
        } else {
          console.error('Token verification failed with status:', response.status);
        }
      } catch (error) {
        console.error('Token verification error:', error);
      } finally {
        if (epoch === authEpochRef.current) {
          setLoading(false);
        }
      }
    };
    
    if (token) {
      verifyTokenAsync();
    }
  }, [persistAuthSnapshot, token]);

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
      
      notify.success(`Welcome to ${PRODUCT_NAME}, ${data.user.name}!`);
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

  // Logout function — always clear the httpOnly platform cookie via API
  const logout = async () => {
    authEpochRef.current += 1;

    if (user?.id && typeof window !== 'undefined') {
      sessionStorage.removeItem(documentExpiryAlertKey(user.id));
    }

    setToken(null);
    setUser(null);
    setError(null);
    
    // Clear all auth-related data from storage
    persistAuthSnapshot(null, null);
    initialUserRef.current = null;
    
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Platform logout request failed:', error);
    }

    // Best-effort clear of any non-httpOnly leftovers (match Secure both ways for local leftovers)
    document.cookie = 'token=; Path=/; Max-Age=0; SameSite=Strict';
    document.cookie = 'token=; Path=/; Max-Age=0; SameSite=Strict; Secure';
    document.cookie = 'user=; Path=/; Max-Age=0; SameSite=Strict';
    document.cookie = 'user=; Path=/; Max-Age=0; SameSite=Strict; Secure';

    // Drop stale RSC auth props so Fast Refresh / remounts cannot revive the old JWT.
    router.refresh();
    
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
    const epoch = authEpochRef.current;
    
    try {
      const response = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (epoch !== authEpochRef.current) return;
      
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        persistAuthSnapshot(token, data.user);
      } else if (isInvalidAuthResponse(response.status)) {
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