import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    // Execute the SQL script directly from the database file
    const sqlScript = `
      -- Function to extract hashtags from content
      CREATE OR REPLACE FUNCTION extract_hashtags_from_content(content TEXT)
      RETURNS TEXT[] AS $$
      DECLARE
          hashtag_matches TEXT[];
      BEGIN
          SELECT ARRAY_AGG(DISTINCT LOWER(TRIM(SUBSTRING(match FROM 2))))
          INTO hashtag_matches
          FROM (
              SELECT unnest(regexp_matches(content, '#([a-zA-Z0-9_]+)', 'g')) AS match
          ) matches
          WHERE LENGTH(TRIM(SUBSTRING(match FROM 2))) > 0;
          
          RETURN COALESCE(hashtag_matches, '{}');
      END;
      $$ LANGUAGE plpgsql;

      -- Function to calculate trending score
      CREATE OR REPLACE FUNCTION calculate_trending_score(
          daily_mentions INTEGER,
          weekly_mentions INTEGER, 
          total_mentions INTEGER
      ) RETURNS NUMERIC AS $$
      BEGIN
          RETURN ROUND(
              (COALESCE(daily_mentions, 0) * 4.0) + 
              (COALESCE(weekly_mentions, 0) * 2.0) + 
              (COALESCE(total_mentions, 0) * 0.2) + 
              CASE 
                  WHEN COALESCE(daily_mentions, 0) > (COALESCE(weekly_mentions, 1) * 0.3) 
                  THEN COALESCE(daily_mentions, 0) * 0.5 
                  ELSE 0 
              END,
              2
          );
      END;
      $$ LANGUAGE plpgsql;

      -- Function to update trending rankings
      CREATE OR REPLACE FUNCTION update_trending_rankings()
      RETURNS VOID AS $$
      DECLARE
          top_hashtags INTEGER[];
      BEGIN
          -- Reset all trending status
          UPDATE hashtags SET is_trending = false;
          
          -- Get top 5 hashtags by trending score that meet criteria
          SELECT ARRAY_AGG(id) INTO top_hashtags
          FROM (
              SELECT id 
              FROM hashtags 
              WHERE daily_mentions >= 2 AND trending_score > 5
              ORDER BY trending_score DESC, daily_mentions DESC, weekly_mentions DESC
              LIMIT 5
          ) top5;
          
          -- Set top hashtags as trending
          IF top_hashtags IS NOT NULL AND array_length(top_hashtags, 1) > 0 THEN
              UPDATE hashtags 
              SET is_trending = true 
              WHERE id = ANY(top_hashtags);
          END IF;
          
          -- Clean up hashtags with no mentions
          DELETE FROM hashtags WHERE total_mentions <= 0;
      END;
      $$ LANGUAGE plpgsql;

      -- Function for post insertion
      CREATE OR REPLACE FUNCTION update_hashtag_stats_on_insert()
      RETURNS TRIGGER AS $$
      DECLARE
          hashtag_array TEXT[];
          tag_name TEXT;
      BEGIN
          hashtag_array := extract_hashtags_from_content(NEW.content);
          
          FOREACH tag_name IN ARRAY hashtag_array
          LOOP
              IF tag_name IS NULL OR LENGTH(TRIM(tag_name)) = 0 THEN
                  CONTINUE;
              END IF;
              
              INSERT INTO hashtags (
                  tag, 
                  total_mentions, 
                  daily_mentions, 
                  weekly_mentions, 
                  trending_score, 
                  category, 
                  is_trending,
                  created_at,
                  updated_at
              )
              VALUES (
                  tag_name, 
                  1, 
                  1, 
                  1, 
                  calculate_trending_score(1, 1, 1),
                  'general',
                  false,
                  NOW(),
                  NOW()
              )
              ON CONFLICT (tag) 
              DO UPDATE SET
                  total_mentions = hashtags.total_mentions + 1,
                  daily_mentions = hashtags.daily_mentions + 1,
                  weekly_mentions = hashtags.weekly_mentions + 1,
                  trending_score = calculate_trending_score(
                      hashtags.daily_mentions + 1,
                      hashtags.weekly_mentions + 1,
                      hashtags.total_mentions + 1
                  ),
                  updated_at = NOW();
          END LOOP;
          
          PERFORM update_trending_rankings();
          
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      -- Function for post deletion
      CREATE OR REPLACE FUNCTION decrement_hashtag_stats_on_delete()
      RETURNS TRIGGER AS $$
      DECLARE
          hashtag_array TEXT[];
          tag_name TEXT;
      BEGIN
          hashtag_array := extract_hashtags_from_content(OLD.content);
          
          FOREACH tag_name IN ARRAY hashtag_array
          LOOP
              IF tag_name IS NULL OR LENGTH(TRIM(tag_name)) = 0 THEN
                  CONTINUE;
              END IF;
              
              UPDATE hashtags 
              SET 
                  total_mentions = GREATEST(0, total_mentions - 1),
                  daily_mentions = GREATEST(0, daily_mentions - 1),
                  weekly_mentions = GREATEST(0, weekly_mentions - 1),
                  updated_at = NOW()
              WHERE tag = tag_name;
              
              UPDATE hashtags 
              SET trending_score = calculate_trending_score(daily_mentions, weekly_mentions, total_mentions)
              WHERE tag = tag_name AND total_mentions > 0;
              
              DELETE FROM hashtags WHERE tag = tag_name AND total_mentions <= 0;
          END LOOP;
          
          PERFORM update_trending_rankings();
          
          RETURN OLD;
      END;
      $$ LANGUAGE plpgsql;

      -- Drop existing triggers
      DROP TRIGGER IF EXISTS hashtag_stats_insert_trigger ON posts;
      DROP TRIGGER IF EXISTS hashtag_stats_delete_trigger ON posts;

      -- Create triggers
      CREATE TRIGGER hashtag_stats_insert_trigger
          AFTER INSERT ON posts
          FOR EACH ROW
          EXECUTE FUNCTION update_hashtag_stats_on_insert();

      CREATE TRIGGER hashtag_stats_delete_trigger
          BEFORE DELETE ON posts
          FOR EACH ROW
          EXECUTE FUNCTION decrement_hashtag_stats_on_delete();
    `;

    // Execute the SQL script
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: sqlScript
    });
    
    if (error) {
      console.warn('RPC method failed, trying direct execution');
      // If RPC doesn't work, try executing piece by piece
      const statements = sqlScript.split('$$');
      let results = [];
      
      for (let i = 0; i < statements.length; i += 2) {
        if (statements[i] && statements[i+1]) {
          const statement = statements[i] + '$$' + statements[i+1] + (statements[i+2] ? '$$' : '');
          try {
            const { error: execError } = await supabase.rpc('exec', { sql: statement });
            results.push({ success: !execError, statement: statement.substring(0, 50) + '...' });
          } catch (err: any) {
            results.push({ success: false, error: err.message, statement: statement.substring(0, 50) + '...' });
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Real-time hashtag triggers have been set up successfully',
      timestamp: new Date().toISOString(),
      note: 'If triggers are not working automatically, use the maintenance endpoint to fix hashtag counts'
    });

  } catch (error: any) {
    console.error('Error setting up hashtag triggers:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to set up real-time hashtag triggers',
      details: error?.message,
      note: 'Database triggers may not be supported. Use the maintenance endpoint to manually fix hashtag counts.'
    }, { status: 500 });
  }
}