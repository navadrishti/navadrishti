'use client';

import { createContext, useContext, useState, useEffect, useEffectEvent, useCallback, useRef, ReactNode } from 'react';
import { toast } from 'sonner';
import { getDocumentExpiryAlertCopy } from './auth/document-expiry';
import { getVerificationReviewNotice } from './verification-review-notice';
import { isPlatformLoginRequiredPath, PRODUCT_NAME } from './access-control';
import { getErrorMessage } from '@/lib/utils';
import { readApiError } from '@/lib/user-facing-error';
import { createClient } from '@/lib/supabase';
import { setClientSessionToken } from '@/lib/client-session';

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

function usableStoredValue(value: string | null): string | null {
  if (!value || value === 'undefined' || value === 'null') return null;
  const cleaned = value.replace(/["']/g, '').trim();
  return cleaned && cleaned !== 'undefined' && cleaned !== 'null' ? cleaned : null;
}

/** Platform tabs share one account through localStorage. sessionStorage is only a leftover mirror. */
function readPlatformAuthFromStorage(): { token: string | null; userJson: string | null } {
  if (typeof window === 'undefined') return { token: null, userJson: null };
  const rawUser = localStorage.getItem('user');
  const userJson =
    !rawUser || rawUser === 'undefined' || rawUser === 'null' ? null : rawUser;
  return {
    token: usableStoredValue(localStorage.getItem('token')),
    userJson,
  };
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

function verificationReviewAlertKey(userId: number, kind: string) {
  return `navadrishti:verification-review-alert:${userId}:${kind}`;
}

function notifyVerificationReviewForUser(user: User) {
  if (typeof window === 'undefined') return;

  const notice = getVerificationReviewNotice({
    userType: user.user_type,
    verificationStatus: user.verification_status,
    profileData: user.profile_data || user.profile,
    reverificationPending: Boolean(
      user.profile_data?.reverification_pending || user.profile?.reverification_pending
    ),
  });
  if (!notice) return;

  const key = verificationReviewAlertKey(user.id, notice.kind);
  if (sessionStorage.getItem(key)) return;

  sessionStorage.setItem(key, '1');
  window.setTimeout(() => {
    toast.info(notice.title, {
      description: notice.description,
      duration: DOCUMENT_EXPIRY_ALERT_DURATION_MS,
    });
  }, 800);
}

function isSameUser(a: User | null | undefined, b: User | null | undefined) {
  if (a === b) return true
  if (!a || !b) return false
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

export interface User {
  id: number;
  email: string;
  name: string;
  user_type: 'individual' | 'ngo' | 'company';
  profile_image?: string;
  cover_image?: string;
  profile?: Record<string, unknown>;
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
  verification_details?: unknown;
  profile_data?: Record<string, unknown>;
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
  phone?: string;
  city?: string;
  state_province?: string;
  pincode?: string;
  country?: string;
  location?: string;
  ngo_volunteer_capacity?: number;
  profile_data?: Record<string, unknown>;
}

interface AuthProviderProps {
  children: ReactNode;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const getFriendlySignupErrorMessage = (data: { error?: unknown } | null, status: number): string => {
  if (status === 409) {
    return 'An account with this email already exists. Please log in or use a different email.';
  }

  if (status >= 500) {
    return 'We could not create your account right now. Please try again in a moment.';
  }

  const fromApi = readApiError(data, status === 400 ? 'Please check your details and try again.' : 'Unable to create account. Please try again.')
  return fromApi
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
  const tokenRef = useRef<string | null>(null);

  const persistAuthSnapshot = useCallback((nextToken: string | null, nextUser: User | null) => {
    setClientSessionToken(nextToken);
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');

    if (nextUser) {
      const serializedUser = JSON.stringify(nextUser);
      if (localStorage.getItem('user') !== serializedUser) {
        localStorage.setItem('user', serializedUser);
      }
      if (sessionStorage.getItem('user') !== serializedUser) {
        sessionStorage.setItem('user', serializedUser);
      }
    } else {
      localStorage.removeItem('user');
      sessionStorage.removeItem('user');
    }
  }, []);

  const hydrateUserFromServer = useCallback(async (
    authToken: string | null,
    fallbackUser?: User | null,
    options?: { keepExistingToken?: boolean; preserveOnUnauthorized?: boolean },
  ) => {
    if (isAuthRevoked()) return null;

    const epoch = authEpochRef.current;
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'include',
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
      });

      if (epoch !== authEpochRef.current) return null;

      if (response.ok) {
        const data = await response.json();
        if (!data?.user?.id || Number(data.user.id) <= 0) {
          persistAuthSnapshot(null, null);
          tokenRef.current = null;
          setToken(null);
          setUser(null);
          return null;
        }
        const issuedToken = typeof data.token === 'string' && data.token.trim() ? data.token : null;
        const nextToken = options?.keepExistingToken
          ? (authToken || issuedToken)
          : (issuedToken || authToken);
        setUser((prev) => (isSameUser(prev, data.user) ? prev : data.user));
        if (nextToken && nextToken !== tokenRef.current) {
          tokenRef.current = nextToken;
          setToken(nextToken);
        }
        persistAuthSnapshot(nextToken, data.user);
        return data.user as User;
      }

      if (isInvalidAuthResponse(response.status)) {
        if (options?.preserveOnUnauthorized && fallbackUser) {
          setUser((prev) => (isSameUser(prev, fallbackUser) ? prev : fallbackUser));
          tokenRef.current = authToken;
          setToken(authToken);
          persistAuthSnapshot(authToken, fallbackUser);
          return fallbackUser;
        }
        persistAuthSnapshot(null, null);
        tokenRef.current = null;
        setToken(null);
        setUser(null);
        return null;
      }
    } catch (err) {
      console.error('User hydration error:', err);
    }

    if (epoch !== authEpochRef.current) return null;

    if (fallbackUser) {
      setUser((prev) => (isSameUser(prev, fallbackUser) ? prev : fallbackUser));
      setToken(authToken);
      persistAuthSnapshot(authToken, fallbackUser);
      return fallbackUser;
    }

    return null;
  }, [persistAuthSnapshot]);

  const syncAuthFromStorage = useCallback(async () => {
    try {
      const liveToken = tokenRef.current;
      const alreadySignedIn = Boolean(liveToken);
      if (!alreadySignedIn) setLoading(true);

      const { token: storedToken, userJson: storedUser } = readPlatformAuthFromStorage();

      // Same-tab logout must stay logged out on remount. A login in another tab writes localStorage
      // and must still be allowed through.
      if (isAuthRevoked() && !storedToken && !storedUser) {
        persistAuthSnapshot(null, null);
        tokenRef.current = null;
        setToken(null);
        setUser(null);
        setLoading(false);
        return;
      }

      // User JSON is the shared account marker. Another tab logging out removes it.
      if (alreadySignedIn && !storedUser && !storedToken) {
        persistAuthSnapshot(null, null);
        tokenRef.current = null;
        setToken(null);
        setUser(null);
        setLoading(false);
        return;
      }

      let fallbackUser: User | null = null;
      if (storedUser) {
        try {
          fallbackUser = JSON.parse(storedUser) as User;
          if (!alreadySignedIn) setUser((prev) => (isSameUser(prev, fallbackUser) ? prev : fallbackUser));
        } catch (parseError) {
          console.error('Error parsing stored user:', parseError);
        }
      }

      clearAuthRevoked();
      const epoch = authEpochRef.current;
      const authToken = storedToken || liveToken;
      if (storedToken && storedToken !== liveToken) {
        tokenRef.current = storedToken;
        setToken(storedToken);
      }

      const hydratedUser = await hydrateUserFromServer(authToken, alreadySignedIn ? fallbackUser : undefined, {
        keepExistingToken: alreadySignedIn,
      });
      if (epoch !== authEpochRef.current) return;
      if (!hydratedUser && !alreadySignedIn) {
        tokenRef.current = null;
        setToken(null);
        setUser(null);
        persistAuthSnapshot(null, null);
      }
      setLoading(false);
      return;
    } catch (error) {
      console.error('Error syncing auth state:', error);
      setLoading(false);
    }
  }, [hydrateUserFromServer, persistAuthSnapshot]);

  const syncAuthOnMount = useEffectEvent(syncAuthFromStorage);

  useEffect(() => {
    syncAuthOnMount();
  }, []);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    if (loading || !user) return;
    notifyDocumentExpiryForUser(user);
    notifyVerificationReviewForUser(user);
  }, [loading, user]);

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
          credentials: 'include',
          headers: { Authorization: `Bearer ${cleanToken}` },
        });

        if (epoch !== authEpochRef.current) return;
        
        if (response.ok) {
          const data = await response.json();
          setUser((prev) => (isSameUser(prev, data.user) ? prev : data.user));
          persistAuthSnapshot(cleanToken, data.user);
        } else if (!isInvalidAuthResponse(response.status)) {
          console.error('Token verification failed with status:', response.status);
        }
        // A 401 here is a race with login/signup hydrate, not a signal to
        // discard a session the server just issued. Mount hydrate and logout
        // still clear expired sessions.
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
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        const errorMessage = readApiError(data, 'Login failed');
        setError(errorMessage);
        toast.error(errorMessage);
        return;
      }
      
      await establishClientSession(data.token, data.user);
      
      toast.success(`Welcome back, ${data.user.name}!`);
    } catch (error) {
      const errorMessage = getErrorMessage(error) || 'An error occurred during login';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const readEmailVerificationToken = async (): Promise<{ token?: string; signOut?: () => void }> => {
    try {
      const supabaseAuth = createClient().auth;
      const { data: otpSession } = await supabaseAuth.getSession();
      return {
        token: otpSession.session?.access_token,
        signOut: otpSession.session ? () => { void supabaseAuth.signOut(); } : undefined,
      };
    } catch (error) {
      console.error('Could not read the email OTP session before signup:', error);
      return {};
    }
  };

  const establishClientSession = async (authToken: string, sessionUser: User) => {
    clearAuthRevoked();
    setToken(authToken);
    tokenRef.current = authToken;
    setUser((prev) => (isSameUser(prev, sessionUser) ? prev : sessionUser));
    persistAuthSnapshot(authToken, sessionUser);
    await hydrateUserFromServer(authToken, sessionUser, { preserveOnUnauthorized: true });
  };

  // Signup function
  const signup = async (userData: SignupData) => {
    setLoading(true);
    setError(null);
    
    try {
      // The email OTP step leaves a Supabase session for that address; the server checks it to mark the email verified.
      const otpSession = await readEmailVerificationToken();
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ...userData, email_verification_token: otpSession.token })
      });
      otpSession.signOut?.();
      
      const data = await response.json();
      
      if (!response.ok) {
        const errorMessage = getFriendlySignupErrorMessage(data, response.status);
        setError(errorMessage);
        toast.error(errorMessage);
        const handledError = new Error(errorMessage) as Error & { handled?: boolean };
        handledError.handled = true;
        throw handledError;
      }
      
      await establishClientSession(data.token, data.user);
      
      toast.success(`Welcome to ${PRODUCT_NAME}, ${data.user.name}!`);
    } catch (error) {
      if ((error as { handled?: boolean } | null)?.handled) {
        throw error;
      }

      const errorMessage = getErrorMessage(error)?.trim()
        ? getErrorMessage(error)
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
    tokenRef.current = null;
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

  const clearError = () => {
    setError(null);
  };

  const updateUser = (userData: Partial<User>) => {
    if (user) {
      const updatedUser = { ...user, ...userData };
      setUser((prev) => (isSameUser(prev, updatedUser) ? prev : updatedUser));
      persistAuthSnapshot(token, updatedUser);
    }
  };

  // Refresh user data from server
  const refreshUser = async () => {
    const epoch = authEpochRef.current;

    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (epoch !== authEpochRef.current) return;
      
      if (response.ok) {
        const data = await response.json();
        setUser((prev) => (isSameUser(prev, data.user) ? prev : data.user));
        persistAuthSnapshot(token, data.user);
      } else if (isInvalidAuthResponse(response.status)) {
        setToken(null);
        setUser(null);
        persistAuthSnapshot(null, null);
      } else {
        toast.error('Failed to refresh user data');
      }
    } catch {
      toast.error('Failed to refresh user data');
    }
  };

  // Keep every platform tab on the same localStorage account. Admin/CA cookies are separate.
  useEffect(() => {
    const rehydrateHandler = () => {
      void syncAuthFromStorage();
    };

    const storageListener = (e: StorageEvent) => {
      if (e.key === 'token' || e.key === 'user' || e.key === null) {
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