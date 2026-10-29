import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import {
  getRuntimeServiceFlags,
  isProductionRuntime,
  productionConfigIssues,
  requiredServicesReady,
} from '@/lib/runtime-services';
import { getErrorMessage } from '@/lib/utils';

export async function GET() {
  try {
    const services = getRuntimeServiceFlags();
    const configIssues = isProductionRuntime() ? productionConfigIssues() : [];
    const checks = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      version: process.env.npm_package_version || '1.0.0',
      checks: {
        database: 'unknown',
        core_config: requiredServicesReady(services) && configIssues.length === 0 ? 'healthy' : 'unhealthy',
      },
      services,
    };

    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Database timeout')), 3000);
      });

      const pingPromise = supabase
        .from('users')
        .select('id')
        .limit(1)
        .then(({ error }) => {
          if (error) throw error;
        });

      await Promise.race([pingPromise, timeoutPromise]);
      checks.checks.database = 'healthy';
    } catch (error) {
      checks.checks.database = 'unhealthy';
      if (process.env.NODE_ENV === 'development') {
        console.error('Database health check failed:', getErrorMessage(error));
      }
    }

    const isHealthy = checks.checks.database === 'healthy' && checks.checks.core_config === 'healthy';
    checks.status = isHealthy ? 'healthy' : 'unhealthy';
    const production = isProductionRuntime();
    const externalReady = services.payments && services.webhook;

    return NextResponse.json({
      status: checks.status,
      timestamp: checks.timestamp,
      checks: {
        database: checks.checks.database,
        core_config: checks.checks.core_config,
        external_services: externalReady ? 'healthy' : production ? 'unhealthy' : 'degraded',
      },
      ...(production
        ? {}
        : {
            environment: checks.environment,
            version: checks.version,
            services,
          }),
    }, {
      status: isHealthy ? 200 : 503,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch {
    return NextResponse.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Service unavailable',
    }, { status: 503 });
  }
}
