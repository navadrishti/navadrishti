import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json();

    if (action === 'add_admin_approval_fields') {
      // For Supabase, we'll need to handle this differently
      // First, let's check if the columns exist by trying to query them
      try {
        await supabase
          .from('service_offers')
          .select('admin_status, admin_reviewed_at, admin_reviewed_by, admin_comments')
          .limit(1);
        
        return NextResponse.json({
          success: true,
          message: 'Admin approval fields already exist',
          status: 'already_migrated'
        });
      } catch (error) {
        // Columns don't exist, we need to add them
        // For now, return instructions for manual migration
        return NextResponse.json({
          success: false,
          message: 'Admin approval fields need to be added manually',
          migration_required: true,
          sql_commands: [
            'ALTER TABLE service_offers ADD COLUMN admin_status TEXT DEFAULT \'pending\';',
            'ALTER TABLE service_offers ADD COLUMN admin_reviewed_at TIMESTAMPTZ;',
            'ALTER TABLE service_offers ADD COLUMN admin_reviewed_by INTEGER REFERENCES users(id);',
            'ALTER TABLE service_offers ADD COLUMN admin_comments TEXT;',
            'CREATE INDEX idx_service_offers_admin_status ON service_offers(admin_status);',
            'UPDATE service_offers SET admin_status = \'pending\' WHERE admin_status IS NULL;'
          ],
          instructions: 'Please run these SQL commands in your Supabase dashboard SQL editor'
        });
      }
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('Database migration error:', error);
    return NextResponse.json({ 
      error: 'Migration check failed', 
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}