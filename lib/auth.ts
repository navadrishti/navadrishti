import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';

// Use a consistent JWT secret and ensure it's available
// Note: Next.js automatically loads .env files, so no need for dotenv.config()
export const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_dev_only';

if (!process.env.JWT_SECRET) {
  console.warn('WARNING: Using fallback JWT_SECRET. Set JWT_SECRET in your .env file for production.');
}

// Interface for user data
export interface UserData {
  id: number;
  email: string;
  name: string;
  user_type: 'individual' | 'ngo' | 'company';
  verification_status?: 'verified' | 'unverified' | 'pending';
  email_verified?: boolean;
  phone_verified?: boolean;
}

// Function to generate JWT token
export function generateToken(user: UserData): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      user_type: user.user_type,
      verification_status: user.verification_status || 'unverified',
      email_verified: user.email_verified || false,
      phone_verified: user.phone_verified || false
    },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

// Function to verify JWT token
export function verifyToken(token: string): UserData | null {
  try {
    if (!token || token.trim() === '') {
      console.error('Token verification failed: Empty or null token');
      return null;
    }

    // Clean the token - remove any extra quotes, whitespace, or invalid characters
    let cleanToken = token.replace(/[\"'\n\r\t]/g, '').trim();
    
    // Remove any 'Bearer ' prefix if it somehow got included
    if (cleanToken.startsWith('Bearer ')) {
      cleanToken = cleanToken.substring(7).trim();
    }
    
    if (cleanToken.length === 0) {
      console.error('Token verification failed: Token is empty after cleaning');
      return null;
    }

    // Validate JWT format (should have 3 parts separated by dots)
    const tokenParts = cleanToken.split('.');
    if (tokenParts.length !== 3) {
      console.error('Token verification failed: Invalid JWT format - expected 3 parts, got', tokenParts.length);
      console.error('Token parts:', tokenParts);
      console.error('Original token:', token);
      console.error('Clean token:', cleanToken);
      return null;
    }

    // Try to decode the token
    const decoded = jwt.verify(cleanToken, JWT_SECRET) as any;
    
    if (!decoded || !decoded.id || !decoded.email) {
      console.error('Token verification failed: Invalid token structure', decoded);
      return null;
    }

    return {
      id: decoded.id,
      email: decoded.email,
      name: decoded.name || '',
      user_type: decoded.user_type || 'individual'
    } as UserData;
  } catch (error) {
    console.error('Token verification failed:', error);
    console.error('Token causing error:', token);
    
    // Clear invalid token from browser storage
    if (typeof window !== 'undefined') {
      console.log('Clearing corrupted token from browser storage');
      document.cookie = 'token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('user');
    }
    return null;
  }
}

// Function to hash password
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

// Function to compare password with hash
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Middleware to authenticate requests
export function withAuth(handler: Function) {
  return async (req: NextRequest, ...args: any[]) => {
    try {
      // Extract token from Authorization header or cookies
      const authHeader = req.headers.get('authorization');
      let token;
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        // Extract token from Authorization header
        token = authHeader.substring(7);
      } else {
        // Try to get from cookies
        const cookieToken = req.cookies.get('token')?.value;
        if (!cookieToken) {
          return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }
        token = cookieToken;
      }

      // Verify token
      const user = verifyToken(token);
      if (!user) {
        return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
      }

      // Attach user to request
      (req as any).user = user;

      // Call the original handler
      return handler(req, ...args);
    } catch (error) {
      console.error('Authentication error:', error);
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }
  };
}