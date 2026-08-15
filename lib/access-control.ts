/**
 * Access Control System for Navadrishti Platform
 * 
 * Defines permissions based on user type and verification status
 * Controls access to posts, service requests/offers, messaging, and dashboards.
 */

export type UserType = 'individual' | 'ngo' | 'company';
export type VerificationStatus = 'verified' | 'unverified' | 'pending' | 'suspended';

export interface User {
  id: number;
  user_type: UserType;
  verification_status: VerificationStatus;
  email_verified?: boolean;
  phone_verified?: boolean;
}

export interface AccessPermissions {
  // Social features
  canCreatePosts: boolean;
  canCommentOnPosts: boolean;
  canLikePosts: boolean;
  
  // Service system
  canCreateServiceRequests: boolean;
  canApplyToServiceRequests: boolean;
  canCreateServiceOffers: boolean;
  canApplyToServiceOffers: boolean;
  
  // Communication
  canSendMessages: boolean;
  canReceiveMessages: boolean;
  
  // Profile features
  canViewFullProfiles: boolean;
  canAccessVerificationPage: boolean;
  
  // System features
  canAccessDashboard: boolean;
}

/**
 * Get comprehensive access permissions for a user
 */
export function getUserPermissions(user: User | null): AccessPermissions {
  // Default permissions for unauthenticated users
  if (!user) {
    return {
      canCreatePosts: false,
      canCommentOnPosts: false,
      canLikePosts: false,
      canCreateServiceRequests: false,
      canApplyToServiceRequests: false,
      canCreateServiceOffers: false,
      canApplyToServiceOffers: false,
      canSendMessages: false,
      canReceiveMessages: false,
      canViewFullProfiles: false,
      canAccessVerificationPage: false,
      canAccessDashboard: false,
    };
  }

  const isVerified = user.verification_status === 'verified';
  const isEmailVerified = user.email_verified || false;
  const isPhoneVerified = user.phone_verified || false;
  const hasBasicVerification = isEmailVerified || isPhoneVerified;

  // Base permissions for authenticated users
  const basePermissions: AccessPermissions = {
    // Basic social features available to all authenticated users (no verification required)
    canCreatePosts: true, // Only authentication required for posts
    canCommentOnPosts: true, // Only authentication required for comments  
    canLikePosts: true, // Always allow liking for authenticated users
    
    // Service system permissions
    canCreateServiceRequests: false,
    canApplyToServiceRequests: false,
    canCreateServiceOffers: false,
    canApplyToServiceOffers: false,
    
    // Communication
    canSendMessages: hasBasicVerification,
    canReceiveMessages: true,
    
    // Profile features
    canViewFullProfiles: true,
    canAccessVerificationPage: true,
    
    // System features
    canAccessDashboard: true,
  };

  // Enhanced permissions based on user type and verification status
  switch (user.user_type) {
    case 'individual':
      return {
        ...basePermissions,
        canApplyToServiceRequests: isVerified,
        canCreateServiceOffers: isVerified,
        canApplyToServiceOffers: isVerified,
      };
      
    case 'ngo':
      return {
        ...basePermissions,
        canCreateServiceRequests: isVerified,
        canCreateServiceOffers: isVerified,
        canApplyToServiceOffers: isVerified,
      };
      
    case 'company':
      return {
        ...basePermissions,
        canCreateServiceOffers: isVerified,
        canApplyToServiceOffers: isVerified,
      };
      
    default:
      return basePermissions;
  }
}

/**
 * Check if user has permission for a specific action
 */
export function hasPermission(user: User | null, permission: keyof AccessPermissions): boolean {
  const permissions = getUserPermissions(user);
  return permissions[permission];
}

/**
 * Get user-friendly error message for insufficient permissions
 */
export function getPermissionErrorMessage(permission: keyof AccessPermissions, user: User | null): string {
  if (!user) {
    return "Please sign in to access this feature.";
  }

  const isVerified = user.verification_status === 'verified';
  const isEmailVerified = user.email_verified || false;

  switch (permission) {
    case 'canCreatePosts':
    case 'canCommentOnPosts':
      return "Please sign in to create posts and comments."; // Only authentication required
        
    case 'canCreateServiceRequests':
      if (user.user_type !== 'ngo') {
        return "Only NGOs can create service requests.";
      }
      return !isVerified 
        ? "Please complete your NGO verification to create service requests."
        : "You don't have permission to create service requests.";
        
    case 'canApplyToServiceRequests':
      if (user.user_type === 'ngo') {
        return "NGOs create service requests, they cannot apply to them.";
      }
      if (user.user_type === 'individual') {
        return !isVerified 
          ? "Please complete your identity verification to apply for service requests."
          : "You don't have permission to apply to service requests.";
      }
      if (user.user_type === 'company') {
        return "Companies cannot volunteer for service requests.";
      }
      return "You don't have permission to apply to service requests.";
        
    case 'canCreateServiceOffers':
      if (!['ngo', 'company', 'individual'].includes(user.user_type)) {
        return "Only verified participants can create capability offers.";
      }
      return !isVerified 
        ? "Please complete verification to create capability offers."
        : "You don't have permission to create service offers.";
        
    case 'canApplyToServiceOffers':
      if (user.user_type === 'individual') {
        return !isVerified 
          ? "Please complete your identity verification to respond to capability offers."
          : "You don't have permission to apply to service offers.";
      }
      if (user.user_type === 'company') {
        return !isVerified
          ? "Please complete company verification to respond to capability offers."
          : "You don't have permission to apply to service offers.";
      }
      if (user.user_type === 'ngo') {
        return !isVerified
          ? "Please complete NGO verification to respond to capability offers."
          : "You don't have permission to apply to service offers.";
      }
      return "You don't have permission to apply to service offers.";
        
    default:
      return !isVerified 
        ? "Please complete your verification to access this feature."
        : "You don't have permission to access this feature.";
  }
}

/**
 * Redirect paths for different user types when accessing restricted content
 */
export function getRedirectPathForUserType(userType: UserType): string {
  switch (userType) {
    case 'individual':
      return '/individuals/dashboard';
    case 'ngo':
      return '/ngos/dashboard';
    case 'company':
      return '/companies/dashboard';
    default:
      return '/';
  }
}

/**
 * Check if user type has access to a specific route
 */
export function canAccessRoute(userType: UserType | undefined, routePath: string): boolean {
  if (!userType) return false;
  
  // Route-specific access control
  const routeAccess: Record<string, UserType[]> = {
    '/individuals/dashboard': ['individual'],
    '/ngos/dashboard': ['ngo'],
    '/companies/dashboard': ['company'],
    '/service-requests/create': ['ngo'],
    '/service-offers/create': ['ngo', 'company', 'individual'],
  };
  
  const allowedUserTypes = routeAccess[routePath];
  if (!allowedUserTypes) return true; // Route has no specific restrictions
  
  return allowedUserTypes.includes(userType);
}

// --- Launch phase gating ---

export type LaunchPhase = 1 | 2;

export type LaunchHeaderNavItem = {
  label: string;
  href: string;
  description: string;
  external?: boolean;
};

export const NAVADRISHTI_ABOUT_URL = 'https://navadrishti.in';
export const NAVADRISHTI_CONTACT_HREF = 'mailto:connect@navadrishti.in';

const PHASE1_BLOCKED_ROUTE_PREFIXES = [
  '/service-requests',
  '/service-offers',
  '/csr-campaigns',
  '/companies/csr-agent',
  '/companies/csr-budget',
  '/companies/csr-health',
  '/companies/impact-reports',
  '/ngos/ai-agent',
  '/ngos/ngo-agent',
  '/ngos/ngo-matching',
  // Phase 1 special portals allowed via URL: /ca and /admin only.
  // Evidence Verification opens again from Phase 2.
  '/evidence-verification',
] as const;

/**
 * Far-future / paused surfaces — blocked in every launch phase (including Phase 2).
 * Covers government admin + analytics, and social posts (not shipping for now).
 */
const PERMANENTLY_BLOCKED_ROUTE_PREFIXES = [
  '/government-admin',
  '/posts',
  '/home',
] as const;

function matchesRoutePrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function getLaunchPhase(): LaunchPhase {
  const raw = String(process.env.NEXT_PUBLIC_LAUNCH_PHASE || '2').trim();
  return raw === '1' ? 1 : 2;
}

export function isPhase1Launch(): boolean {
  return getLaunchPhase() === 1;
}

/** Browser tab / document title for the active launch phase. */
export function getSiteDocumentTitle(): string {
  if (isPhase1Launch()) {
    return 'Navadrishti | CA-Verified NGO Directory for India';
  }
  return 'Navadrishti | Digital OS for Social Impact';
}

export function isPermanentlyBlockedPath(pathname: string): boolean {
  return PERMANENTLY_BLOCKED_ROUTE_PREFIXES.some((prefix) =>
    matchesRoutePrefix(pathname, prefix)
  );
}

export function isPhase1BlockedPath(pathname: string): boolean {
  if (!isPhase1Launch()) {
    return false;
  }

  return PHASE1_BLOCKED_ROUTE_PREFIXES.some((prefix) =>
    matchesRoutePrefix(pathname, prefix)
  );
}

/** True when the path must not be served for the current launch phase. */
export function isLaunchBlockedPath(pathname: string): boolean {
  return isPermanentlyBlockedPath(pathname) || isPhase1BlockedPath(pathname);
}

export function getLaunchBlockedRedirectPath(pathname: string): string {
  if (isPermanentlyBlockedPath(pathname)) {
    return '/';
  }
  return getLaunchPhaseRedirectPath();
}

export function getLaunchPhaseRedirectPath(): string {
  return '/ngo-network';
}

export function getLaunchHeaderNavItems(phase2Items: LaunchHeaderNavItem[]): LaunchHeaderNavItem[] {
  if (!isPhase1Launch()) {
    return phase2Items;
  }

  return [
    {
      label: 'NGO Network',
      href: '/ngo-network',
      description: 'Browse verified NGOs',
    },
    {
      label: 'About Us',
      href: NAVADRISHTI_ABOUT_URL,
      description: 'About Navadrishti',
      external: true,
    },
    {
      label: 'Contact Us',
      href: NAVADRISHTI_CONTACT_HREF,
      description: 'Contact Navadrishti',
    },
  ];
}

export function shouldShowRootSubNavbar(): boolean {
  return !isPhase1Launch();
}

export function shouldShowPayoutAccountPanel(
  userType: 'individual' | 'ngo' | 'company' | string | null | undefined
): boolean {
  if (userType === 'ngo') {
    return true;
  }

  if (userType === 'individual' || userType === 'company') {
    return !isPhase1Launch();
  }

  return false;
}

export function filterDashboardSidebarItems<T extends { value: string }>(items: T[]): T[] {
  if (!isPhase1Launch()) {
    return items;
  }

  return items.filter((item) => item.value === 'profile');
}

export function resolvePhase1DashboardTab(requestedTab: string | null | undefined): string {
  if (!isPhase1Launch()) {
    return requestedTab || 'profile';
  }

  return 'profile';
}