import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Get product details using Supabase helpers
    const product = await db.marketplaceItems.getById(parseInt(id));

    if (!product || product.status !== 'active') {
      return Response.json({ 
        success: false,
        error: 'Product not found' 
      }, { status: 404 });
    }

    // For now, return simplified product data (reviews and questions can be added later)
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

    // Format the response
    const formattedProduct = {
      ...product,
      tags: safeJsonParse(product.tags, []),
      images: safeJsonParse(product.images, []),
      contact_info: safeJsonParse(product.contact_info, {}),
      dimensions_cm: safeJsonParse(product.dimensions_cm, {}),
      variants: safeJsonParse(product.variants, {}),
      specifications: safeJsonParse(product.specifications, {}),
      features: safeJsonParse(product.features, []),
      price: parseFloat(product.price),
      compare_price: product.compare_price ? parseFloat(product.compare_price) : null,
      avg_rating: product.avg_rating ? parseFloat(product.avg_rating) : 0,
      review_count: parseInt(product.review_count) || 0,
      total_sold: parseInt(product.total_sold) || 0,
      reviews: reviews.map(review => ({
        ...review,
        images: safeJsonParse(review.images, [])
      })),
      questions: questions
    };

    return Response.json({
      success: true,
      product: formattedProduct
    });

  } catch (error: any) {
    console.error('Product fetch error:', error);
    return Response.json({ 
      success: false,
      error: 'Failed to fetch product',
      details: error.message 
    }, { status: 500 });
  }
}