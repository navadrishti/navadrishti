'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { toast } from 'sonner';
import { getDocumentExpiryAlertCopy } from './auth';
import { isPlatformLoginRequiredPath, PRODUCT_NAME } from './access-control';

const DOCUMENT_EXPIRY_ALERT_DURATION_MS = 18000;
const documentExpiryAlertKey = (userId: number) => `navadrishti:document-expiry-alert:${userId}`;
const AUTH_REVOKED_KEY = 'navadrishti:auth-revoked';

function markAuthRevoked() {
  try {
    sessionStorage.setItem(AUTH_REVOKED_KEY, '1');
  } catch {
    // ignore
  }
}

function clearAuthRevoked() {
  try {
    sessionStorage.removeItem(AUTH_REVOKED_KEY);
  } catch {
    // ignore
  }
}

function isAuthRevoked() {
  try {
    return sessionStorage.getItem(AUTH_REVOKED_KEY) === '1';
  } catch {
    return false;
  }
}

function notifyDocumentExpiryForUser(user: User) {
  if (typeof window === 'undefined' || user.user_type !== 'ngo') return;

  const key = documentExpiryAlertKey(user.id);
  if (sessionStorage.getItem(key)) return;

  const copy = getDocumentExpiryAlertCopy(user.profile_data || user.profile);
  if (!copy) return;

  sessionStorage.setItem(key, '1');
  window.setTimeout(() => {
    toast.info(copy.title, {
      description: copy.description,
      duration: DOCUMENT_EXPIRY_ALERT_DURATION_MS,
    });
  }, 800);
}

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
}

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

// 403 is included so banned/suspended accounts are automatically signed out
// when /api/auth/me returns an access-block error.
const isInvalidAuthResponse = (status: number) => status === 401 || status === 403 || status === 404;

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
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

  const hydrateUserFromServer = useCallback(async (authToken: string, fallbackUser?: User | null) => {
    if (isAuthRevoked()) return null;

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

  const syncAuthFromStorage = useCallback(async () => {
    const epoch = authEpochRef.current;
    try {
      setLoading(true);

      if (isAuthRevoked()) {
        persistAuthSnapshot(null, null);
        setToken(null);
        setUser(null);
        setLoading(false);
        return;
      }

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

      setToken(null);
      setUser(null);
      setLoading(false);
    } catch (error) {
      console.error('Error syncing auth state:', error);
      setLoading(false);
    }
  }, [hydrateUserFromServer, persistAuthSnapshot]);

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
      if (!token || isAuthRevoked()) return;
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
        toast.error(errorMessage);
        return;
      }
      
      // Save token and user to state and localStorage
      clearAuthRevoked();
      setToken(data.token);
      persistAuthSnapshot(data.token, null);

      await hydrateUserFromServer(data.token, data.user);
      
      toast.success(`Welcome back, ${data.user.name}!`);
    } catch (error: any) {
      const errorMessage = error.message || 'An error occurred during login';
      setError(errorMessage);
      toast.error(errorMessage);
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
        toast.error(errorMessage);
        const handledError = new Error(errorMessage) as Error & { handled?: boolean };
        handledError.handled = true;
        throw handledError;
      }
      
      // Save token and user to state and localStorage
      clearAuthRevoked();
      setToken(data.token);
      persistAuthSnapshot(data.token, null);

      await hydrateUserFromServer(data.token, data.user);
      
      toast.success(`Welcome to ${PRODUCT_NAME}, ${data.user.name}!`);
    } catch (error: any) {
      if (error?.handled) {
        throw error;
      }

      const errorMessage = error?.message?.trim()
        ? error.message
        : 'Unable to create account right now. Please try again.';
      setError(errorMessage);
      toast.error(errorMessage);
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

    markAuthRevoked();
    setToken(null);
    setUser(null);
    setError(null);
    persistAuthSnapshot(null, null);

    if (typeof window === 'undefined') return;

    const pathname = window.location.pathname;
    const search = window.location.search;
    const redirectTo = isPlatformLoginRequiredPath(pathname)
      ? '/'
      : `${pathname}${search}` || '/';

    void fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
    }).catch((error) => {
      console.error('Platform logout request failed:', error);
    });

    window.location.replace(redirectTo);
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
        toast.error('Failed to refresh user data');
      }
    } catch (error) {
      toast.error('Failed to refresh user data');
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

export function useAuth() {
  const context = useContext(AuthContext);
  
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
}