import { executeQuery } from '@/lib/db';

export async function GET() {
  try {
    // Get all NGOs from the database
    const ngos = await executeQuery({
      query: `
        SELECT id, name, email
        FROM users 
        WHERE user_type = 'ngo'
        ORDER BY name ASC
      `
    }) as any[];

    return Response.json({
      success: true,
      ngos: ngos.map(ngo => ({
        id: ngo.id,
        name: ngo.name,
        email: ngo.email
      }))
    });

  } catch (error: any) {
    console.error('NGO list fetch error:', error);
    return Response.json({
      success: false,
      error: 'Failed to fetch NGO list',
      details: error.message
    }, { status: 500 });
  }
}