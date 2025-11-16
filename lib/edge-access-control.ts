/**
 * Edge Runtime compatible access control utilities for middleware
 */

import { NextRequest } from 'next/server';
import { verifyEdgeToken, type EdgeUser } from '@/lib/edge-auth';

/**
 * Extract and verify JWT token from request headers (Edge Runtime compatible)
 */
export async function verifyAuthTokenEdge(request: NextRequest): Promise<EdgeUser | null> {
  try {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7);
    return await verifyEdgeToken(token);
  } catch (error) {
    return null;
  }
}

/**
 * Simplified permission checking for middleware (Edge Runtime)
 */
export function hasBasicPermissionEdge(
  user: EdgeUser | null, 
  action: 'create_post' | 'create_service_request' | 'create_service_offer' | 'create_marketplace'
): boolean {
  if (!user) return false;

  const isVerified = user.verification_status === 'verified';
  const hasBasicVerification = Boolean(user.email_verified || user.phone_verified);

  switch (action) {
    case 'create_post':
      return true; // Only authentication required, no verification needed
    
    case 'create_service_request':
      return isVerified && (user.user_type === 'ngo' || user.user_type === 'company');
    
    case 'create_service_offer':
      return isVerified && user.user_type === 'ngo';
    
    case 'create_marketplace':
      return isVerified && (user.user_type === 'ngo' || user.user_type === 'company');
    
    default:
      return false;
  }
}