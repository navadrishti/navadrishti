import { supabase } from '@/lib/db';

export async function GET() {
  try {
    // Get all NGOs from the database
    const { data: ngos, error } = await supabase
      .from('users')
      .select('id, name, email')
      .eq('user_type', 'ngo')
      .order('name', { ascending: true });

    if (error) {
      throw error;
    }

    return Response.json({
      success: true,
      ngos: ngos?.map(ngo => ({
        id: ngo.id,
        name: ngo.name,
        email: ngo.email
      })) || []
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