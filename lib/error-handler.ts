/**
 * Production-ready error handling utilities
 */

import { NextResponse } from 'next/server';

export interface ApiError {
  code: string;
  message: string;
  statusCode: number;
  details?: any;
}

export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public isOperational: boolean;
  public details?: any;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_ERROR', details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

export const ErrorCodes = {
  // Authentication
  UNAUTHORIZED: 'UNAUTHORIZED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  
  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  
  // Resources
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  
  // Rate Limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  
  // Server
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR'
} as const;

export function createErrorResponse(error: AppError | Error | string, statusCode = 500): NextResponse {
  let response: ApiError;

  if (error instanceof AppError) {
    response = {
      code: error.code,
      message: error.message,
      statusCode: error.statusCode,
      details: process.env.NODE_ENV === 'development' ? error.details : undefined
    };
  } else if (error instanceof Error) {
    response = {
      code: ErrorCodes.INTERNAL_ERROR,
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      statusCode,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    };
  } else {
    response = {
      code: ErrorCodes.INTERNAL_ERROR,
      message: typeof error === 'string' ? error : 'Unknown error occurred',
      statusCode
    };
  }

  // Log error for monitoring
  console.error('API Error:', {
    code: response.code,
    message: response.message,
    statusCode: response.statusCode,
    timestamp: new Date().toISOString()
  });

  return NextResponse.json(
    { 
      error: response.message,
      code: response.code,
      ...(response.details && { details: response.details })
    },
    { status: response.statusCode }
  );
}

export function validateRequiredFields(data: any, requiredFields: string[]): void {
  for (const field of requiredFields) {
    if (!data[field] || (typeof data[field] === 'string' && !data[field].trim())) {
      throw new AppError(
        `Missing required field: ${field}`,
        400,
        ErrorCodes.MISSING_REQUIRED_FIELD,
        { field }
      );
    }
  }
}

export function sanitizeInput(input: string, maxLength = 1000): string {
  if (typeof input !== 'string') return '';
  
  return input
    .trim()
    .substring(0, maxLength)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
    .replace(/javascript:/gi, '') // Remove javascript: protocols
    .replace(/on\w+=/gi, ''); // Remove event handlers
}

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  context = 'Unknown operation'
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    console.error(`Error in ${context}:`, error);
    
    if (error instanceof AppError) {
      throw error;
    }
    
    throw new AppError(
      'An unexpected error occurred',
      500,
      ErrorCodes.INTERNAL_ERROR,
      process.env.NODE_ENV === 'development' ? error : undefined
    );
  }
}

// Rate limiting utility
const requestCounts = new Map<string, { count: number; resetTime: number }>();

export function checkRateLimit(
  identifier: string, 
  maxRequests = 100, 
  windowMs = 15 * 60 * 1000 // 15 minutes
): boolean {
  const now = Date.now();
  const record = requestCounts.get(identifier);
  
  if (!record || now > record.resetTime) {
    requestCounts.set(identifier, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  if (record.count >= maxRequests) {
    return false;
  }
  
  record.count++;
  return true;
}