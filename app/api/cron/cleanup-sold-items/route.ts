import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * Cron job endpoint to automatically delete sold items after 1 hour
 * 
 * This endpoint should be called by a cron service (e.g., Vercel Cron, GitHub Actions, or external cron)
 * Schedule: Every 15 minutes or hourly
 * 
 * Authorization: Uses a secret token to prevent unauthorized access
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret for security
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET || 'your-secure-cron-secret';
    
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Calculate the timestamp 1 hour ago
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);
    const cutoffTime = oneHourAgo.toISOString();

    console.log('Running cleanup for items sold before:', cutoffTime);

    // Find all items that have been sold for more than 1 hour
    const { data: itemsToDelete, error: fetchError } = await db.supabase
      .from('marketplace_items')
      .select('id, title, sold_at')
      .eq('status', 'sold')
      .not('sold_at', 'is', null)
      .lt('sold_at', cutoffTime);

    if (fetchError) {
      console.error('Error fetching sold items:', fetchError);
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to fetch sold items' 
      }, { status: 500 });
    }

    if (!itemsToDelete || itemsToDelete.length === 0) {
      console.log('No items to delete');
      return NextResponse.json({
        success: true,
        message: 'No items to delete',
        deletedCount: 0
      });
    }

    console.log(`Found ${itemsToDelete.length} items to delete:`, itemsToDelete);

    // Delete the items
    const itemIds = itemsToDelete.map(item => item.id);
    const { error: deleteError } = await db.supabase
      .from('marketplace_items')
      .delete()
      .in('id', itemIds);

    if (deleteError) {
      console.error('Error deleting items:', deleteError);
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to delete items' 
      }, { status: 500 });
    }

    console.log(`Successfully deleted ${itemsToDelete.length} sold items`);

    return NextResponse.json({
      success: true,
      message: `Deleted ${itemsToDelete.length} sold items`,
      deletedCount: itemsToDelete.length,
      deletedItems: itemsToDelete.map(item => ({
        id: item.id,
        title: item.title,
        soldAt: item.sold_at
      }))
    });

  } catch (error) {
    console.error('Cleanup cron job error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Alternative manual trigger endpoint (for testing)
export async function POST(request: NextRequest) {
  try {
    // This allows manual triggering via API call for testing
    const body = await request.json();
    const { secret } = body;
    
    const cronSecret = process.env.CRON_SECRET || 'your-secure-cron-secret';
    
    if (secret !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Call the GET handler
    return GET(request);
    
  } catch (error) {
    console.error('Manual cleanup trigger error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to trigger cleanup' 
    }, { status: 500 });
  }
}
