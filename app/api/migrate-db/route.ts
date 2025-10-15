import { NextRequest } from 'next/server';
import { migrateDatabase } from '@/lib/migrate-db';

export async function POST(request: NextRequest) {
  try {
    const result = await migrateDatabase();
    
    if (result.success) {
      return Response.json({
        success: true,
        message: 'Database migration completed successfully'
      });
    } else {
      return Response.json({
        success: false,
        error: 'Migration failed',
        details: result.error
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error('Migration API error:', error);
    return Response.json({
      success: false,
      error: 'Migration failed',
      details: error.message
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return Response.json({
    message: 'Use POST to run database migration'
  });
}