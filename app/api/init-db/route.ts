import { initializeDatabase } from '@/lib/db';

export async function GET() {
  try {
    // Initialize the database tables
    const success = await initializeDatabase();
    
    if (!success) {
      return Response.json({ error: 'Failed to initialize database' }, { status: 500 });
    }
    
    return Response.json({ 
      message: 'Database tables initialized successfully',
      status: 'ready for use'
    });
    
  } catch (error: any) {
    console.error('Database initialization error:', error);
    return Response.json({ 
      error: 'Error initializing database',
      details: error.message
    }, { status: 500 });
  }
}