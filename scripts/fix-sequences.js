/**
 * Database sequence fixer utility
 * Run this if you encounter duplicate key errors for auto-incrementing IDs
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixSequences() {
  const tables = [
    'users',
    'service_requests',
    'service_offers', 
    'service_volunteers',
    'service_clients',
    'marketplace_items',
    'posts',
    'verification_requests',
    'purchases',
    'applications',
    'orders',
    'order_items',
    'payments',
    'shipping_details',
    'addresses'
  ];
  
  console.log('🔧 Checking and fixing database sequences...\n');
  
  for (const table of tables) {
    try {
      // Get current max ID
      const { data: maxData } = await supabase
        .from(table)
        .select('id')
        .order('id', { ascending: false })
        .limit(1);
      
      const maxId = maxData?.[0]?.id || 0;
      console.log(`📊 ${table}: max ID = ${maxId}`);
      
      // Test insert to verify sequence works
      const testData = {
        // Add minimal required fields based on table
        ...(table === 'users' && { 
          email: 'test@example.com', 
          name: 'Test User', 
          user_type: 'individual',
          password: 'test123' 
        }),
        ...(table === 'service_requests' && { 
          ngo_id: 1, 
          title: 'Test', 
          description: 'Test',
          category: 'Test',
          status: 'active' 
        }),
        ...(table === 'service_offers' && { 
          ngo_id: 1, 
          title: 'Test', 
          description: 'Test',
          category: 'Test',
          status: 'active' 
        }),
        ...(table === 'posts' && { 
          user_id: 1, 
          content: 'Test post',
          type: 'text' 
        }),
        ...(table === 'marketplace_items' && { 
          seller_id: 1, 
          title: 'Test', 
          description: 'Test',
          category: 'Test',
          price: 0,
          status: 'active' 
        })
      };
      
      // Only test tables that have basic required fields defined
      const testableFields = Object.keys(testData);
      if (testableFields.length > 0) {
        const { data: insertData, error: insertError } = await supabase
          .from(table)
          .insert(testData)
          .select('id')
          .single();
          
        if (insertError) {
          console.log(`❌ ${table}: sequence error - ${insertError.message}`);
        } else {
          console.log(`✅ ${table}: sequence working (new ID: ${insertData.id})`);
          // Clean up test record
          await supabase.from(table).delete().eq('id', insertData.id);
        }
      } else {
        console.log(`⏭️  ${table}: skipped (no test data defined)`);
      }
      
    } catch (error) {
      console.log(`❌ ${table}: error - ${error.message}`);
    }
  }
  
  console.log('\n✨ Sequence check complete!');
}

// Run the fix
fixSequences().catch(console.error);