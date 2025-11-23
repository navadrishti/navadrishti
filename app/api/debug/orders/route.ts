import { NextRequest } from 'next/server';
import db from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    // Get all orders to debug the data structure
    const orders = await db.orders.getAll();
    
    // Map orders to show the key identifying fields
    const debugOrders = orders.map(order => ({
      id: order.id,
      order_number: order.order_number,
      status: order.status,
      buyer_id: order.buyer_id,
      seller_id: order.seller_id,
      created_at: order.created_at,
      total_amount: order.total_amount
    }));

    return Response.json({
      success: true,
      count: orders.length,
      orders: debugOrders
    });

  } catch (error: any) {
    console.error('Debug orders error:', error);
    return Response.json({ 
      error: 'Failed to fetch debug orders',
      details: error.message 
    }, { status: 500 });
  }
}