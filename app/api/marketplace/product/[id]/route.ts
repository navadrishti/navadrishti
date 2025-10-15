import { NextRequest } from 'next/server';
import { executeQuery } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Get product details with seller information
    const productQuery = `
      SELECT 
        mi.*,
        u.name as seller_name,
        u.email as seller_email,
        u.user_type as seller_type,
        AVG(pr.rating) as avg_rating,
        COUNT(pr.id) as review_count,
        COUNT(DISTINCT o.id) as total_sold
      FROM marketplace_items mi
      LEFT JOIN users u ON mi.seller_id = u.id
      LEFT JOIN product_reviews pr ON mi.id = pr.marketplace_item_id AND pr.status = 'approved'
      LEFT JOIN order_items oi ON mi.id = oi.marketplace_item_id
      LEFT JOIN orders o ON oi.order_id = o.id AND o.status IN ('confirmed', 'processing', 'shipped', 'delivered')
      WHERE mi.id = ? AND mi.status = 'active'
      GROUP BY mi.id
    `;

    const productResult = await executeQuery({
      query: productQuery,
      values: [id]
    }) as any[];

    if (!productResult.length) {
      return Response.json({ 
        success: false,
        error: 'Product not found' 
      }, { status: 404 });
    }

    const product = productResult[0];

    // Get product reviews
    const reviewsQuery = `
      SELECT 
        pr.*,
        u.name as reviewer_name,
        u.user_type as reviewer_type
      FROM product_reviews pr
      LEFT JOIN users u ON pr.user_id = u.id
      WHERE pr.marketplace_item_id = ? AND pr.status = 'approved'
      ORDER BY pr.created_at DESC
      LIMIT 10
    `;

    const reviews = await executeQuery({
      query: reviewsQuery,
      values: [id]
    }) as any[];

    // Get product questions
    const questionsQuery = `
      SELECT 
        pq.*,
        u.name as questioner_name,
        answerer.name as answerer_name
      FROM product_questions pq
      LEFT JOIN users u ON pq.user_id = u.id
      LEFT JOIN users answerer ON pq.answered_by = answerer.id
      WHERE pq.marketplace_item_id = ? AND pq.status IN ('pending', 'answered')
      ORDER BY pq.created_at DESC
      LIMIT 10
    `;

    const questions = await executeQuery({
      query: questionsQuery,
      values: [id]
    }) as any[];

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

// POST - Add review or question
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { action, rating, title, review_text, question } = body;

    // Get authenticated user
    const authHeader = request.headers.get('authorization');
    const cookieToken = request.cookies.get('token')?.value;
    
    let token;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (cookieToken) {
      token = cookieToken;
    } else {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    const user = verifyToken(token);
    if (!user) {
      return Response.json({ error: 'Invalid authentication' }, { status: 401 });
    }

    const userId = user.id;

    if (action === 'review') {
      // Check if user has purchased this product
      const purchaseCheck = await executeQuery({
        query: `SELECT COUNT(*) as count FROM order_items oi 
          JOIN orders o ON oi.order_id = o.id 
          WHERE oi.marketplace_item_id = ? AND o.buyer_id = ? AND o.status = 'delivered'`,
        values: [id, userId]
      }) as any[];

      const hasPurchased = purchaseCheck[0].count > 0;

      // Insert review
      await executeQuery({
        query: `INSERT INTO product_reviews (
          marketplace_item_id, user_id, rating, title, review_text, verified_purchase, status
        ) VALUES (?, ?, ?, ?, ?, ?, 'approved')`,
        values: [id, userId, rating, title || null, review_text || null, hasPurchased]
      });

      // Update product rating
      const ratingUpdate = await executeQuery({
        query: `UPDATE marketplace_items SET 
          rating_average = (SELECT AVG(rating) FROM product_reviews WHERE marketplace_item_id = ? AND status = 'approved'),
          rating_count = (SELECT COUNT(*) FROM product_reviews WHERE marketplace_item_id = ? AND status = 'approved')
          WHERE id = ?`,
        values: [id, id, id]
      });

      return Response.json({
        success: true,
        message: 'Review added successfully'
      });

    } else if (action === 'question') {
      // Insert question
      await executeQuery({
        query: `INSERT INTO product_questions (
          marketplace_item_id, user_id, question, status
        ) VALUES (?, ?, ?, 'pending')`,
        values: [id, userId, question]
      });

      return Response.json({
        success: true,
        message: 'Question submitted successfully'
      });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error: any) {
    console.error('Product action error:', error);
    return Response.json({ 
      success: false,
      error: 'Failed to process request',
      details: error.message 
    }, { status: 500 });
  }
}