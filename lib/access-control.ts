/**
 * Access Control System for Navadrishti Platform
 * 
 * Defines permissions based on user type and verification status
 * Controls access to posts, service requests/offers, messaging, and dashboards.
 */

export type UserType = 'individual' | 'ngo' | 'company';
export type VerificationStatus = 'verified' | 'unverified' | 'pending';

export interface User {
  id: string;
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
        canApplyToServiceOffers: isVerified,
      };
      
    case 'ngo':
      return {
        ...basePermissions,
        canCreateServiceRequests: isVerified,
        canCreateServiceOffers: isVerified,
      };
      
    case 'company':
      return {
        ...basePermissions,
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
      if (user.user_type !== 'ngo') {
        return "Only verified NGOs can create service offers.";
      }
      return !isVerified 
        ? "Please complete your NGO verification to create service offers."
        : "You don't have permission to create service offers.";
        
    case 'canApplyToServiceOffers':
      if (user.user_type === 'ngo') {
        return "NGOs create service offers, they cannot apply to them.";
      }
      if (user.user_type === 'individual') {
        return !isVerified 
          ? "Please complete your identity verification to apply for service offers."
          : "You don't have permission to apply to service offers.";
      }
      if (user.user_type === 'company') {
        return "Companies cannot apply to service offers.";
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
    '/service-offers/create': ['ngo'],
  };
  
  const allowedUserTypes = routeAccess[routePath];
  if (!allowedUserTypes) return true; // Route has no specific restrictions
  
  return allowedUserTypes.includes(userType);
}