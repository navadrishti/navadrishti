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
  try {
    // Replace URL-safe characters
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    
    // Add padding if needed
    while (base64.length % 4) {
      base64 += '=';
    }
    
    // Use TextDecoder for edge runtime compatibility
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Decode as UTF-8
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(bytes);
  } catch (error) {
    console.log('Base64 decode error:', error);
    throw error;
  }
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
    console.log('=== Edge Token Verification Debug ===');
    console.log('Token received:', token?.substring(0, 50) + '...');
    
    if (!token || typeof token !== 'string') {
      console.log('Token validation failed: null or not string');
      return null;
    }

    // Split JWT into parts
    const parts = token.split('.');
    console.log('Token parts count:', parts.length);
    if (parts.length !== 3) {
      console.log('Invalid JWT format: expected 3 parts, got', parts.length);
      return null;
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    // Decode header and payload
    let header, payload;
    try {
      header = JSON.parse(base64UrlDecode(headerB64));
      payload = JSON.parse(base64UrlDecode(payloadB64));
      console.log('Header decoded successfully:', header);
      console.log('Payload decoded successfully:', payload);
    } catch (e) {
      console.log('Failed to decode header/payload:', e);
      return null;
    }

    // Check algorithm
    if (header.alg !== 'HS256') {
      console.log('Unsupported algorithm:', header.alg);
      return null;
    }

    // Verify signature
    const signatureData = `${headerB64}.${payloadB64}`;
    const expectedSignature = await hmacSha256(JWT_SECRET, signatureData);
    const expectedSignatureB64 = arrayBufferToBase64Url(expectedSignature);

    console.log('Signature verification:');
    console.log('  Received signature:', signatureB64.substring(0, 20) + '...');
    console.log('  Expected signature:', expectedSignatureB64.substring(0, 20) + '...');
    console.log('  Signatures match:', signatureB64 === expectedSignatureB64);

    if (signatureB64 !== expectedSignatureB64) {
      console.log('Signature verification failed');
      return null;
    }

    // Check expiration
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      console.log('Token expired:', new Date(payload.exp * 1000));
      return null;
    }

    console.log('Token verification successful, returning user data');

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