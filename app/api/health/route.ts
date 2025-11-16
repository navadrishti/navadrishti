import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export async function GET() {
  try {
    // Production health check endpoint
    const checks = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      version: process.env.npm_package_version || '1.0.0',
      checks: {
        database: 'unknown',
        external_services: 'unknown'
      }
    };

    // Check database connection with timeout
    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Database timeout')), 3000);
      });

      const pingPromise = supabase
        .from('users')
        .select('count')
        .limit(1);

      await Promise.race([pingPromise, timeoutPromise]);
      checks.checks.database = 'healthy';
    } catch (error: any) {
      checks.checks.database = 'unhealthy';
      if (process.env.NODE_ENV === 'development') {
        console.error('Database health check failed:', error?.message);
      }
    }

    // Check external services configuration
    const requiredEnvVars = [
      'NEXT_PUBLIC_SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY', 
      'JWT_SECRET'
    ];
    
    const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
    checks.checks.external_services = missingEnvVars.length === 0 ? 'healthy' : 'degraded';

    // Determine overall health
    const isHealthy = checks.checks.database !== 'unhealthy' && 
                     checks.checks.external_services !== 'unhealthy';

    if (!isHealthy) {
      checks.status = 'degraded';
    }

    return NextResponse.json(checks, { 
      status: isHealthy ? 200 : 503,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });

  } catch (error) {
    return NextResponse.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: process.env.NODE_ENV === 'development' ? 'Health check failed' : 'Service unavailable'
    }, { status: 503 });
  }
}