import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env' });

const NGO_NETWORK_GENERAL_SOURCE = 'ngo_network_general';
const NGO_NETWORK_SOURCE = 'ngo_network';

function parseJsonRecord(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isLegacyGeneralSupport(row: {
  title?: unknown;
  requirements?: unknown;
  project_context?: unknown;
}): boolean {
  const requirements = parseJsonRecord(row.requirements);
  if (requirements.ngo_network_general === true || requirements.source === NGO_NETWORK_GENERAL_SOURCE) {
    return true;
  }

  const title = String(row.title || '').trim();
  if (/^General support\s-/i.test(title)) return true;

  const projectContext = parseJsonRecord(row.project_context);
  return (
    projectContext.source === NGO_NETWORK_GENERAL_SOURCE ||
    projectContext.source === NGO_NETWORK_SOURCE
  );
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env');
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabase
    .from('service_requests')
    .select('id, title, requirements, project_context');

  if (error) throw error;

  const legacyRows = (data || []).filter((row) => isLegacyGeneralSupport(row));
  const legacyIds = legacyRows.map((row) => Number(row.id)).filter((id) => id > 0);

  console.log(`Found ${legacyIds.length} legacy General support request(s):`, legacyIds);

  let deleted = 0;
  const errors: Array<{ id: number; error: string }> = [];

  for (const id of legacyIds) {
    try {
      await supabase
        .from('razorpay_payment_orders')
        .update({ service_request_id: null, updated_at: new Date().toISOString() })
        .eq('service_request_id', id);

      await supabase.from('service_volunteers').delete().eq('service_request_id', id);
      await supabase.from('service_request_contributions').delete().eq('service_request_id', id);

      const { error: deleteError } = await supabase.from('service_requests').delete().eq('id', id);
      if (deleteError) throw deleteError;

      deleted += 1;
      console.log(`Deleted request #${id}`);
    } catch (err: any) {
      errors.push({ id, error: err?.message || 'Delete failed' });
      console.error(`Failed to delete request #${id}:`, err?.message || err);
    }
  }

  console.log(`Done. Deleted ${deleted}/${legacyIds.length}.`);
  if (errors.length > 0) {
    console.error('Errors:', errors);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
