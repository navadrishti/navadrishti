import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

const SERVICE_OFFERS_SCHEMA_SQL = [
  "ALTER TABLE public.service_offers ADD COLUMN IF NOT EXISTS offer_type TEXT;",
  "ALTER TABLE public.service_offers ADD COLUMN IF NOT EXISTS requirements JSONB;",
  "ALTER TABLE public.service_offers ADD COLUMN IF NOT EXISTS admin_status TEXT DEFAULT 'pending';",
  'ALTER TABLE public.service_offers ADD COLUMN IF NOT EXISTS admin_reviewed_at TIMESTAMPTZ;',
  'ALTER TABLE public.service_offers ADD COLUMN IF NOT EXISTS admin_reviewed_by INTEGER REFERENCES public.users(id);',
  'ALTER TABLE public.service_offers ADD COLUMN IF NOT EXISTS admin_comments TEXT;',
  "UPDATE public.service_offers SET admin_status = 'pending' WHERE admin_status IS NULL;",
  "UPDATE public.service_offers SET offer_type = CASE category WHEN 'Funding Capacity' THEN 'financial' WHEN 'Material Supply' THEN 'material' WHEN 'Skill / Expertise' THEN 'service' WHEN 'Execution Capability' THEN 'infrastructure' ELSE NULL END WHERE offer_type IS NULL;",
  "UPDATE public.service_offers SET offer_type = CASE WHEN offer_type IS NULL THEN CASE category WHEN 'Funding Capacity' THEN 'financial' WHEN 'Material Supply' THEN 'material' WHEN 'Skill / Expertise' THEN 'service' WHEN 'Execution Capability' THEN 'infrastructure' ELSE NULL END WHEN lower(offer_type) IN ('financial', 'funding', 'funding capacity') THEN 'financial' WHEN lower(offer_type) IN ('material', 'material supply', 'supply') THEN 'material' WHEN lower(offer_type) IN ('service', 'skill', 'expertise', 'skill / expertise') THEN 'service' WHEN lower(offer_type) IN ('infrastructure', 'execution', 'execution capability') THEN 'infrastructure' ELSE NULL END;",
  'ALTER TABLE public.service_offers DROP CONSTRAINT IF EXISTS service_offers_offer_type_chk;',
  "ALTER TABLE public.service_offers ADD CONSTRAINT service_offers_offer_type_chk CHECK (offer_type IN ('financial', 'material', 'service', 'infrastructure'));",
  "UPDATE public.service_offers SET requirements = '{}'::jsonb WHERE requirements IS NULL;",
  "CREATE INDEX IF NOT EXISTS idx_service_offers_admin_status ON public.service_offers(admin_status);",
  'CREATE INDEX IF NOT EXISTS idx_service_offers_offer_type ON public.service_offers(offer_type);'
];

const hasMissingColumnMessage = (error: unknown) => {
  const message = String((error as any)?.message || '');
  return message.includes('column') || message.includes("Could not find the '");
};

export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json();

    if (action === 'align_service_offers_schema') {
      try {
        await supabase
          .from('service_offers')
          .select('offer_type, requirements, admin_status, admin_reviewed_at, admin_reviewed_by, admin_comments')
          .limit(1);

        return NextResponse.json({
          success: true,
          message: 'service_offers schema is already aligned',
          status: 'already_migrated'
        });
      } catch (error) {
        if (hasMissingColumnMessage(error)) {
          return NextResponse.json({
            success: false,
            message: 'service_offers schema needs migration',
            migration_required: true,
            sql_commands: SERVICE_OFFERS_SCHEMA_SQL,
            instructions: 'Run these SQL commands in Supabase SQL Editor, then redeploy/restart API server and remove fallback logic.'
          });
        }

        throw error;
      }
    }

    if (action === 'add_admin_approval_fields') {
      return NextResponse.json({
        success: false,
        message: 'Deprecated action. Use action="align_service_offers_schema" for complete migration.',
        migration_required: true,
        sql_commands: SERVICE_OFFERS_SCHEMA_SQL,
        instructions: 'Please run these SQL commands in Supabase SQL editor.'
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('Database migration error:', error);
    return NextResponse.json({ 
      error: 'Migration check failed', 
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}