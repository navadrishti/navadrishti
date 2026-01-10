import { NextRequest } from 'next/server';
import { db, supabase } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Get comprehensive product details with seller information using Supabase
    const { data: productResult, error } = await supabase
      .from('marketplace_items')
      .select(`
        *,
        users!seller_id(name, email, user_type, profile_image, city, state_province, pincode)
      `)
      .eq('id', parseInt(id))
      .eq('status', 'active')
      .single();

    if (error || !productResult) {
      return Response.json({ 
        success: false,
        error: 'Product not found' 
      }, { status: 404 });
    }

    // Get seller verification status
    let sellerVerificationStatus = 'unverified';
    if (productResult.users?.user_type && productResult.seller_id) {
      try {
        const userType = productResult.users.user_type;
        let verificationQuery;
        
        if (userType === 'individual') {
          verificationQuery = supabase
            .from('individual_verifications')
            .select('verification_status')
            .eq('user_id', productResult.seller_id)
            .single();
        } else if (userType === 'company') {
          verificationQuery = supabase
            .from('company_verifications')
            .select('verification_status')
            .eq('user_id', productResult.seller_id)
            .single();
        } else if (userType === 'ngo') {
          verificationQuery = supabase
            .from('ngo_verifications')
            .select('verification_status')
            .eq('user_id', productResult.seller_id)
            .single();
        }
        
        if (verificationQuery) {
          const { data: verificationData } = await verificationQuery;
          if (verificationData?.verification_status) {
            sellerVerificationStatus = verificationData.verification_status;
          }
        }
      } catch (verificationError) {
        console.log('Error fetching verification status:', verificationError);
        // Keep default 'unverified' status
      }
    }

    const product = {
      ...productResult,
      seller_name: productResult.users?.name || 'Unknown Seller',
      seller_email: productResult.users?.email,
      seller_type: productResult.users?.user_type,
      seller_profile_image: productResult.users?.profile_image,
      seller_city: productResult.users?.city,
      seller_state_province: productResult.users?.state_province,
      seller_pincode: productResult.users?.pincode,
      seller_verification_status: sellerVerificationStatus
    };

    // For now, return empty reviews and questions arrays (can be enhanced later)
    const reviews: any[] = [];
    const questions: any[] = [];

    // Fetch reviews for this item
    const { data: reviewsData, error: reviewsError } = await supabase
      .from('marketplace_item_reviews')
      .select(`
        *,
        reviewer:users!reviewer_id(name, profile_image)
      `)
      .eq('marketplace_item_id', parseInt(id))
      .eq('status', 'published')
      .order('created_at', { ascending: false });

    if (!reviewsError && reviewsData) {
      reviews.push(...reviewsData.map(review => {
        // Parse images if it's a string
        let images = review.images || [];
        if (typeof images === 'string') {
          try {
            images = JSON.parse(images);
          } catch (e) {
            images = [];
          }
        }
        
        return {
          ...review,
          reviewer_name: review.reviewer?.name || 'Anonymous',
          reviewer_avatar: review.reviewer?.profile_image,
          images: Array.isArray(images) ? images : []
        };
      }));
    }

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
      seller_id: product.seller_id,
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

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    
    // Handle review submission
    if (body.action === 'review') {
      // Verify authentication
      const authHeader = request.headers.get('authorization');
      
      if (!authHeader) {
        return Response.json({ 
          success: false,
          error: 'Authentication required' 
        }, { status: 401 });
      }

      const token = authHeader.replace('Bearer ', '');
      const decoded = await verifyToken(token);
      
      if (!decoded || !decoded.id) {
        return Response.json({ 
          success: false,
          error: 'Invalid authentication token' 
        }, { status: 401 });
      }

      const userId = decoded.id;
      const itemId = parseInt(id);

      // Validate required fields
      const { rating, review_text, title } = body;
      
      if (!rating || rating < 1 || rating > 5) {
        return Response.json({ 
          success: false,
          error: 'Rating must be between 1 and 5' 
        }, { status: 400 });
      }

      if (!review_text || review_text.trim().length === 0) {
        return Response.json({ 
          success: false,
          error: 'Review text is required' 
        }, { status: 400 });
      }

      if (review_text.length > 1000) {
        return Response.json({ 
          success: false,
          error: 'Review text must be 1000 characters or less' 
        }, { status: 400 });
      }

      if (title && title.length > 200) {
        return Response.json({ 
          success: false,
          error: 'Title must be 200 characters or less' 
        }, { status: 400 });
      }

      // Check if user already reviewed this item
      const { data: existingReview } = await supabase
        .from('marketplace_item_reviews')
        .select('id')
        .eq('marketplace_item_id', itemId)
        .eq('reviewer_id', userId)
        .single();

      if (existingReview) {
        return Response.json({ 
          success: false,
          error: 'You have already reviewed this item' 
        }, { status: 409 });
      }

      // Check if user purchased this item (for verified_purchase badge)
      const { data: purchaseData } = await supabase
        .from('ecommerce_order_items')
        .select('id, order_id, ecommerce_orders!inner(buyer_id, status)')
        .eq('marketplace_item_id', itemId)
        .eq('ecommerce_orders.buyer_id', userId)
        .in('ecommerce_orders.status', ['completed', 'delivered'])
        .limit(1);

      const verifiedPurchase = !!purchaseData && purchaseData.length > 0;
      const purchaseId = verifiedPurchase ? purchaseData[0].id : null;

      // Create the review
      // Filter out null/empty images
      const validImages = (body.images || []).filter((img: any) => img && typeof img === 'string' && img.trim().length > 0);
      
      const { data: newReview, error: insertError } = await supabase
        .from('marketplace_item_reviews')
        .insert({
          marketplace_item_id: itemId,
          reviewer_id: userId,
          rating: parseInt(rating),
          title: title || null,
          review_text: review_text.trim(),
          images: validImages,
          verified_purchase: verifiedPurchase,
          purchase_id: purchaseId,
          status: 'published',
          helpful_count: 0,
          unhelpful_count: 0,
          reviewed_by_admin: false
        })
        .select()
        .single();

      if (insertError) {
        return Response.json({ 
          success: false,
          error: 'Failed to create review',
          details: insertError.message 
        }, { status: 500 });
      }

      // Update item rating statistics
      const { data: stats } = await supabase
        .from('marketplace_item_reviews')
        .select('rating')
        .eq('marketplace_item_id', itemId)
        .eq('status', 'published');

      if (stats && stats.length > 0) {
        const totalRating = stats.reduce((sum, r) => sum + r.rating, 0);
        const avgRating = totalRating / stats.length;

        await supabase
          .from('marketplace_items')
          .update({
            rating_average: avgRating,
            rating_count: stats.length
          })
          .eq('id', itemId);
      }

      return Response.json({
        success: true,
        data: newReview,
        message: 'Review submitted successfully'
      });
    }

    // Unknown action
    return Response.json({ 
      success: false,
      error: 'Invalid action' 
    }, { status: 400 });

  } catch (error: any) {
    return Response.json({ 
      success: false,
      error: 'Internal server error',
      details: error.message 
    }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    
    // Handle review update
    if (body.action === 'update_review') {
      // Verify authentication
      const authHeader = request.headers.get('authorization');
      
      if (!authHeader) {
        return Response.json({ 
          success: false,
          error: 'Authentication required' 
        }, { status: 401 });
      }

      const token = authHeader.replace('Bearer ', '');
      const decoded = await verifyToken(token);
      
      if (!decoded || !decoded.id) {
        return Response.json({ 
          success: false,
          error: 'Invalid authentication token' 
        }, { status: 401 });
      }

      const userId = decoded.id;
      const reviewId = parseInt(body.reviewId);
      const { rating, title, review_text } = body;

      // Validate input
      if (!rating || rating < 1 || rating > 5) {
        return Response.json({ 
          success: false,
          error: 'Rating must be between 1 and 5' 
        }, { status: 400 });
      }

      if (!review_text || !review_text.trim()) {
        return Response.json({ 
          success: false,
          error: 'Review text is required' 
        }, { status: 400 });
      }

      // Check if review exists and belongs to user
      const { data: review, error: fetchError } = await supabase
        .from('marketplace_item_reviews')
        .select('*')
        .eq('id', reviewId)
        .eq('reviewer_id', userId)
        .single();

      if (fetchError || !review) {
        return Response.json({ 
          success: false,
          error: 'Review not found or you do not have permission to edit it' 
        }, { status: 404 });
      }

      // Update the review
      // Filter out null/empty images
      const validImages = (body.images || []).filter((img: any) => img && typeof img === 'string' && img.trim().length > 0);
      
      const { data: updatedReview, error: updateError } = await supabase
        .from('marketplace_item_reviews')
        .update({
          rating,
          title: title?.trim() || null,
          review_text: review_text.trim(),
          images: validImages,
          updated_at: new Date().toISOString()
        })
        .eq('id', reviewId)
        .select()
        .single();

      if (updateError) {
        return Response.json({ 
          success: false,
          error: 'Failed to update review',
          details: updateError.message 
        }, { status: 500 });
      }

      // Update item rating statistics if rating changed
      if (review.rating !== rating) {
        const { data: stats } = await supabase
          .from('marketplace_item_reviews')
          .select('rating')
          .eq('marketplace_item_id', review.marketplace_item_id)
          .eq('status', 'published');

        if (stats && stats.length > 0) {
          const totalRating = stats.reduce((sum, r) => sum + r.rating, 0);
          const avgRating = totalRating / stats.length;

          await supabase
            .from('marketplace_items')
            .update({
              rating_average: avgRating,
              rating_count: stats.length
            })
            .eq('id', review.marketplace_item_id);
        }
      }

      return Response.json({
        success: true,
        message: 'Review updated successfully',
        review: updatedReview
      });
    }

    // Unknown action
    return Response.json({ 
      success: false,
      error: 'Invalid action' 
    }, { status: 400 });

  } catch (error: any) {
    return Response.json({ 
      success: false,
      error: 'Internal server error',
      details: error.message 
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    
    // Handle review deletion
    if (body.action === 'delete_review') {
      // Verify authentication
      const authHeader = request.headers.get('authorization');
      
      if (!authHeader) {
        return Response.json({ 
          success: false,
          error: 'Authentication required' 
        }, { status: 401 });
      }

      const token = authHeader.replace('Bearer ', '');
      const decoded = await verifyToken(token);
      
      if (!decoded || !decoded.id) {
        return Response.json({ 
          success: false,
          error: 'Invalid authentication token' 
        }, { status: 401 });
      }

      const userId = decoded.id;
      const reviewId = parseInt(body.reviewId);

      // Check if review exists and belongs to user
      const { data: review, error: fetchError } = await supabase
        .from('marketplace_item_reviews')
        .select('*')
        .eq('id', reviewId)
        .eq('reviewer_id', userId)
        .single();

      if (fetchError || !review) {
        return Response.json({ 
          success: false,
          error: 'Review not found or you do not have permission to delete it' 
        }, { status: 404 });
      }

      // Delete the review
      const { error: deleteError } = await supabase
        .from('marketplace_item_reviews')
        .delete()
        .eq('id', reviewId);

      if (deleteError) {
        return Response.json({ 
          success: false,
          error: 'Failed to delete review',
          details: deleteError.message 
        }, { status: 500 });
      }

      // Update item rating statistics
      const { data: stats } = await supabase
        .from('marketplace_item_reviews')
        .select('rating')
        .eq('marketplace_item_id', review.marketplace_item_id)
        .eq('status', 'published');

      if (stats && stats.length > 0) {
        const totalRating = stats.reduce((sum, r) => sum + r.rating, 0);
        const avgRating = totalRating / stats.length;

        await supabase
          .from('marketplace_items')
          .update({
            rating_average: avgRating,
            rating_count: stats.length
          })
          .eq('id', review.marketplace_item_id);
      } else {
        // No reviews left, reset to 0
        await supabase
          .from('marketplace_items')
          .update({
            rating_average: 0,
            rating_count: 0
          })
          .eq('id', review.marketplace_item_id);
      }

      return Response.json({
        success: true,
        message: 'Review deleted successfully'
      });
    }

    // Unknown action
    return Response.json({ 
      success: false,
      error: 'Invalid action' 
    }, { status: 400 });

  } catch (error: any) {
    return Response.json({ 
      success: false,
      error: 'Internal server error',
      details: error.message 
    }, { status: 500 });
  }
}