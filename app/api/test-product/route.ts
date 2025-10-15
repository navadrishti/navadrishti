import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    console.log('Testing marketplace items...');
    
    // Get all marketplace items
    const { data: items, error } = await supabase
      .from('marketplace_items')
      .select('id, title, status')
      .limit(5);

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ success: false, error: error.message });
    }

    console.log('Found marketplace items:', items);

    // Test individual product API
    if (items && items.length > 0) {
      const productId = items[0].id;
      console.log(`Testing product API for ID: ${productId}`);
      
      const { data: productData, error: productError } = await supabase
        .from('marketplace_items')
        .select(`
          *,
          users!seller_id(name, email, user_type)
        `)
        .eq('id', productId)
        .eq('status', 'active')
        .single();

      if (productError) {
        console.error('Product query error:', productError);
      } else {
        console.log('Product query success:', productData);
      }

      return NextResponse.json({
        success: true,
        items: items,
        testProduct: productData || null,
        productError: productError?.message || null
      });
    }

    return NextResponse.json({
      success: true,
      items: items,
      message: 'No items found to test product API'
    });

  } catch (error: any) {
    console.error('Test API error:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}