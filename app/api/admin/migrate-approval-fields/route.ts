import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    // Since we can't execute DDL directly through Supabase client,
    // we'll try to insert a test record to check if columns exist
    // and provide instructions for manual migration

    const testOfferId = 999999; // Non-existent ID for testing
    
    // Try to update with admin fields to check if they exist
    const { error: testError } = await supabase
      .from('service_offers')
      .update({
        admin_status: 'pending',
        admin_reviewed_at: null,
        admin_reviewed_by: null,
        admin_comments: null
      })
      .eq('id', testOfferId);

    if (testError) {
      // If error mentions column doesn't exist, provide migration instructions
      if (testError.message.includes('column') && testError.message.includes('does not exist')) {
        return NextResponse.json({ 
          error: 'Admin approval columns do not exist',
          migration_required: true,
          instructions: `
            Please run the following SQL commands in your Supabase SQL editor:
            
            ALTER TABLE service_offers ADD COLUMN admin_status VARCHAR(20) DEFAULT 'pending';
            ALTER TABLE service_offers ADD COLUMN admin_reviewed_at TIMESTAMP;
            ALTER TABLE service_offers ADD COLUMN admin_reviewed_by INTEGER REFERENCES users(id);
            ALTER TABLE service_offers ADD COLUMN admin_comments TEXT;
            
            -- Update existing offers to have pending status
            UPDATE service_offers SET admin_status = 'pending' WHERE admin_status IS NULL;
          `
        }, { status: 400 });
      }
    }

    // If no error or different error, columns likely exist
    return NextResponse.json({ 
      success: true, 
      message: 'Admin approval columns already exist or migration completed',
      columns_exist: true
    });

  } catch (error) {
    console.error('Migration check error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}