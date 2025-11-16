/**
 * Server-side access control utilities for API routes and middleware
 */

import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '@/lib/auth';
import type { User, UserType, VerificationStatus, AccessPermissions } from '@/lib/access-control';

export interface AuthenticatedUser {
  id: string;
  email: string;
  user_type: UserType;
  verification_status: VerificationStatus;
  email_verified?: boolean;
  phone_verified?: boolean;
}

/**
 * Extract and verify JWT token from request headers
 */
export function verifyAuthToken(request: NextRequest): AuthenticatedUser | null {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7);
    const payload = jwt.verify(token, JWT_SECRET) as any;
    
    return {
      id: payload.id,
      email: payload.email,
      user_type: payload.user_type,
      verification_status: payload.verification_status || 'unverified',
      email_verified: payload.email_verified || false,
      phone_verified: payload.phone_verified || false,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Server-side permission checking for API routes
 */
export function checkApiPermission(
  user: AuthenticatedUser | null,
  requiredPermission: keyof AccessPermissions
): { hasPermission: boolean; errorMessage?: string; statusCode?: number } {
  if (!user) {
    return {
      hasPermission: false,
      errorMessage: 'Authentication required',
      statusCode: 401
    };
  }

  const isVerified = user.verification_status === 'verified';
  const isEmailVerified = user.email_verified || false;
  const hasBasicVerification = isEmailVerified || user.phone_verified || false;

  switch (requiredPermission) {
    case 'canCreatePosts':
    case 'canCommentOnPosts':
      if (!hasBasicVerification) {
        return {
          hasPermission: false,
          errorMessage: 'Email or phone verification required',
          statusCode: 403
        };
      }
      break;

    case 'canCreateServiceRequests':
      if (user.user_type === 'individual') {
        return {
          hasPermission: false,
          errorMessage: 'Only NGOs and companies can create service requests',
          statusCode: 403
        };
      }
      if (!isVerified) {
        return {
          hasPermission: false,
          errorMessage: 'Organization verification required',
          statusCode: 403
        };
      }
      break;

    case 'canApplyToServiceRequests':
      if (user.user_type !== 'individual') {
        return {
          hasPermission: false,
          errorMessage: 'Only individuals can apply to service requests',
          statusCode: 403
        };
      }
      if (!isVerified) {
        return {
          hasPermission: false,
          errorMessage: 'Identity verification required',
          statusCode: 403
        };
      }
      break;

    case 'canCreateServiceOffers':
      if (user.user_type !== 'ngo') {
        return {
          hasPermission: false,
          errorMessage: 'Only NGOs can create service offers',
          statusCode: 403
        };
      }
      if (!isVerified) {
        return {
          hasPermission: false,
          errorMessage: 'NGO verification required',
          statusCode: 403
        };
      }
      break;

    case 'canApplyToServiceOffers':
      if (user.user_type !== 'individual') {
        return {
          hasPermission: false,
          errorMessage: 'Only individuals can apply to service offers',
          statusCode: 403
        };
      }
      if (!isVerified) {
        return {
          hasPermission: false,
          errorMessage: 'Identity verification required',
          statusCode: 403
        };
      }
      break;

    case 'canCreateMarketplaceListings':
      if (user.user_type === 'individual') {
        return {
          hasPermission: false,
          errorMessage: 'Only NGOs and companies can create marketplace listings',
          statusCode: 403
        };
      }
      if (!isVerified) {
        return {
          hasPermission: false,
          errorMessage: 'Organization verification required',
          statusCode: 403
        };
      }
      break;

    case 'canPurchaseFromMarketplace':
      if (!isVerified) {
        return {
          hasPermission: false,
          errorMessage: 'Account verification required for purchases',
          statusCode: 403
        };
      }
      break;

    default:
      // For any other permissions, just check if user is authenticated
      break;
  }

  return { hasPermission: true };
}

/**
 * Middleware function to check API route permissions
 */
export function withPermission(requiredPermission: keyof AccessPermissions) {
  return function (handler: (request: NextRequest, user: AuthenticatedUser) => Promise<Response> | Response) {
    return async function (request: NextRequest): Promise<Response> {
      const user = verifyAuthToken(request);
      const permissionCheck = checkApiPermission(user, requiredPermission);

      if (!permissionCheck.hasPermission) {
        return Response.json(
          { error: permissionCheck.errorMessage },
          { status: permissionCheck.statusCode || 403 }
        );
      }

      return handler(request, user!);
    };
  };
}

/**
 * Route protection configuration
 */
export const protectedRoutes: Record<string, {
  userTypes?: UserType[];
  requireVerification?: boolean;
  permission?: keyof AccessPermissions;
}> = {
  // Dashboard routes
  '/individuals/dashboard': { userTypes: ['individual'] },
  '/ngos/dashboard': { userTypes: ['ngo'] },
  '/companies/dashboard': { userTypes: ['company'] },

  // Service routes
  '/service-requests/create': { 
    userTypes: ['ngo', 'company'], 
    requireVerification: true,
    permission: 'canCreateServiceRequests'
  },
  '/service-offers/create': { 
    userTypes: ['ngo'], 
    requireVerification: true,
    permission: 'canCreateServiceOffers'
  },

  // Marketplace routes
  '/marketplace/create': { 
    userTypes: ['ngo', 'company'], 
    requireVerification: true,
    permission: 'canCreateMarketplaceListings'
  },

  // Profile and verification
  '/verification': { }, // Available to all authenticated users
  '/profile': { }, // Available to all authenticated users
};

/**
 * Check if a route should be protected based on configuration
 */
export function getRouteProtection(pathname: string) {
  // Exact match first
  if (protectedRoutes[pathname]) {
    return protectedRoutes[pathname];
  }

  // Check for pattern matches
  for (const [pattern, config] of Object.entries(protectedRoutes)) {
    if (pathname.startsWith(pattern)) {
      return config;
    }
  }

  return null;
}