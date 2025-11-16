/**
 * Edge Runtime compatible authentication utilities for middleware
 * This file avoids Node.js APIs that aren't supported in Edge Runtime
 */

// JWT secret for Edge Runtime (can't use dotenv here)
export const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_dev_only';

export interface EdgeUser {
  id: string;
  email: string;
  user_type: 'individual' | 'ngo' | 'company';
  verification_status: 'verified' | 'unverified' | 'pending';
  email_verified?: boolean;
  phone_verified?: boolean;
}

/**
 * Base64 URL decode (Edge Runtime compatible)
 */
function base64UrlDecode(str: string): string {
  // Add padding if needed
  str += new Array(5 - str.length % 4).join('=');
  // Replace URL-safe characters
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  // Decode base64
  return atob(str);
}

/**
 * HMAC-SHA256 implementation for Edge Runtime
 */
async function hmacSha256(key: string, data: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const messageData = encoder.encode(data);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  return await crypto.subtle.sign('HMAC', cryptoKey, messageData);
}

/**
 * Convert ArrayBuffer to base64url
 */
function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Verify JWT token in Edge Runtime using Web Crypto API
 */
export async function verifyEdgeToken(token: string): Promise<EdgeUser | null> {
  try {
    if (!token || typeof token !== 'string') {
      return null;
    }

    // Split JWT into parts
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    // Decode header and payload
    let header, payload;
    try {
      header = JSON.parse(base64UrlDecode(headerB64));
      payload = JSON.parse(base64UrlDecode(payloadB64));
    } catch (e) {
      return null;
    }

    // Check algorithm
    if (header.alg !== 'HS256') {
      return null;
    }

    // Verify signature
    const signatureData = `${headerB64}.${payloadB64}`;
    const expectedSignature = await hmacSha256(JWT_SECRET, signatureData);
    const expectedSignatureB64 = arrayBufferToBase64Url(expectedSignature);

    if (signatureB64 !== expectedSignatureB64) {
      return null;
    }

    // Check expiration
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      return null;
    }

    // Return user data
    return {
      id: payload.id?.toString() || '',
      email: payload.email || '',
      user_type: payload.user_type || 'individual',
      verification_status: payload.verification_status || 'unverified',
      email_verified: payload.email_verified || false,
      phone_verified: payload.phone_verified || false,
    };
  } catch (error) {
    return null;
  }
}