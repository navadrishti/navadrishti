import { NextRequest } from 'next/server';
import { db, executeQuery } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    console.log('Product API called with ID:', id);

    // Get comprehensive product details with seller information using SQL
    const productQuery = `
      SELECT 
        mi.*,
        u.name as seller_name,
        u.email as seller_email,
        u.user_type as seller_type
      FROM marketplace_items mi
      LEFT JOIN users u ON mi.seller_id = u.id
      WHERE mi.id = ? AND mi.status = 'active'
    `;

    const productResult = await executeQuery({
      query: productQuery,
      values: [parseInt(id)]
    }) as any[];

    console.log('Product query result:', productResult);

    if (!productResult || productResult.length === 0) {
      console.log('Product not found');
      return Response.json({ 
        success: false,
        error: 'Product not found' 
      }, { status: 404 });
    }

    const product = productResult[0];

    // For now, return empty reviews and questions arrays (can be enhanced later)
    const reviews: any[] = [];
    const questions: any[] = [];

    // Safe JSON parse function
    const safeJsonParse = (jsonString: any, defaultValue: any) => {
      try {
        if (!jsonString) return defaultValue;
        if (typeof jsonString === 'object') return jsonString;
        return JSON.parse(jsonString);
      } catch (e) {
        return defaultValue;
      }
    };

    // Format the response with complete product data
    const formattedProduct = {
      ...product,
      tags: safeJsonParse(product.tags, []),
      images: safeJsonParse(product.images, []),
      contact_info: safeJsonParse(product.contact_info, {}),
      dimensions_cm: safeJsonParse(product.dimensions_cm, {}),
      variants: safeJsonParse(product.variants, {}),
      specifications: safeJsonParse(product.specifications, {}),
      features: safeJsonParse(product.features, []),
      price: parseFloat(product.price) || 0,
      compare_price: product.compare_price ? parseFloat(product.compare_price) : null,
      // Add seller information
      seller_name: product.seller_name || 'Unknown Seller',
      seller_email: product.seller_email,
      seller_type: product.seller_type,
      // Add review/rating data (from the product itself for now)
      avg_rating: parseFloat(product.rating_average) || 0,
      review_count: parseInt(product.rating_count) || 0,
      total_sold: parseInt(product.total_sold) || 0,
      reviews: reviews,
      questions: questions
    };

    console.log('Formatted product response:', formattedProduct);

    return Response.json({
      success: true,
      product: formattedProduct
    });

  } catch (error: any) {
    console.error('Product fetch error:', error);
    console.error('Error stack:', error.stack);
    return Response.json({ 
      success: false,
      error: 'Failed to fetch product',
      details: error.message 
    }, { status: 500 });
  }
}