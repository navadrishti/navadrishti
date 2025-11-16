import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    // Check table counts using Supabase
    const [usersResult, postsResult, hashtagsResult] = await Promise.all([
      supabase.from('users').select('id', { count: 'exact', head: true }),
      supabase.from('posts').select('id', { count: 'exact', head: true }),
      supabase.from('hashtags').select('id', { count: 'exact', head: true })
    ]);

    const tableNames = ['users', 'posts', 'hashtags'];
    const availableTables = [];
    
    // Check which tables are accessible
    if (!usersResult.error) availableTables.push('users');
    if (!postsResult.error) availableTables.push('posts');
    if (!hashtagsResult.error) availableTables.push('hashtags');

    return NextResponse.json({
      success: true,
      data: {
        tables: availableTables,
        counts: {
          users: usersResult.count || 0,
          posts: postsResult.count || 0,
          hashtags: hashtagsResult.count || 0
        }
      }
    });

  } catch (error) {
    console.error('Database check error:', error);
    return NextResponse.json({
      success: false,
      error: 'Database check failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}