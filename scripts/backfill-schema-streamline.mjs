/**
 * Post-migration backfills for 2026_schema_streamline.sql
 * Usage: node --env-file=.env scripts/backfill-schema-streamline.mjs
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY')
  process.exit(1)
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function collectUrlMap(...sources) {
  const out = {}
  for (const source of sources) {
    for (const [key, value] of Object.entries(asRecord(source))) {
      if (typeof value === 'string' && value.trim()) out[key] = value.trim()
      else if (value && typeof value === 'object' && typeof value.url === 'string' && value.url.trim()) {
        out[key] = value.url.trim()
      }
    }
  }
  return out
}

async function backfillCampaignLeadNgo() {
  const { data: campaigns, error } = await supabase
    .from('campaigns')
    .select('id, lead_ngo_user_id, impact_metrics')
    .is('lead_ngo_user_id', null)

  if (error) throw new Error(`campaigns read failed: ${error.message}`)

  let updated = 0
  for (const row of campaigns || []) {
    const impact = asRecord(row.impact_metrics)
    const leadId = Number(impact.selected_lead_ngo_id || 0)
    if (!Number.isFinite(leadId) || leadId <= 0) continue
    const { error: updErr } = await supabase
      .from('campaigns')
      .update({ lead_ngo_user_id: leadId })
      .eq('id', row.id)
      .is('lead_ngo_user_id', null)
    if (updErr) {
      console.warn(`campaign ${row.id}: ${updErr.message}`)
      continue
    }
    updated += 1
  }
  console.log(`lead_ngo_user_id backfill: ${updated} campaign(s)`)
}

async function upsertDoc(row) {
  const { error } = await supabase.from('verification_documents').upsert(
    {
      ...row,
      metadata: row.metadata || {},
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,actor_type,doc_key' }
  )
  if (error) throw new Error(error.message)
}

async function backfillVerificationDocuments() {
  const { data: users, error } = await supabase
    .from('users')
    .select('id, user_type, verification_status, profile_data')
    .in('user_type', ['individual', 'ngo', 'company'])

  if (error) throw new Error(`users read failed: ${error.message}`)

  let upserts = 0
  for (const user of users || []) {
    const actorType = String(user.user_type || '').toLowerCase()
    if (!['individual', 'ngo', 'company'].includes(actorType)) continue

    const profile = asRecord(user.profile_data)
    const verificationDocs = asRecord(profile.verification_documents)
    const actorBlock = asRecord(verificationDocs[actorType])
    const compliance = asRecord(profile.compliance_documents)
    const expiries = asRecord(profile.document_expiries)

    const urlMap = collectUrlMap(
      actorBlock.documents,
      actorBlock.reverification_documents,
      profile.documents,
      compliance,
      actorType === 'ngo' ? profile.ngo_documents : null
    )

    const numbers = {
      ...asRecord(profile.compliance_numbers),
      aadhaar: profile.aadhaar_number || null,
      pan: profile.pan_number || null,
      gst: profile.gst_number || null,
      cin: profile.registration_number || profile.cin || null,
      twelve_a: profile.twelve_a_number || asRecord(profile.compliance_numbers).twelve_a_number || null,
      eighty_g: profile.eighty_g_number || asRecord(profile.compliance_numbers).eighty_g_number || null,
      csr1: profile.csr1_registration_number || asRecord(profile.compliance_numbers).csr1_registration_number || null,
      fcra: profile.fcra_number || null,
    }

    const status =
      String(user.verification_status || '').toLowerCase() === 'verified'
        ? 'accepted'
        : String(user.verification_status || '').toLowerCase() === 'pending'
          ? 'under_review'
          : 'uploaded'

    for (const [docKey, fileUrl] of Object.entries(urlMap)) {
      const expiryRaw = expiries[docKey]
      const validUntil =
        typeof expiryRaw === 'string'
          ? expiryRaw
          : expiryRaw && typeof expiryRaw === 'object'
            ? expiryRaw.valid_until || null
            : null
      const docNumber =
        typeof expiryRaw === 'object' && expiryRaw?.number
          ? String(expiryRaw.number)
          : numbers[docKey]
            ? String(numbers[docKey])
            : null

      await upsertDoc({
        user_id: user.id,
        actor_type: actorType,
        doc_key: docKey,
        file_url: fileUrl,
        doc_number: docNumber,
        valid_until: validUntil || null,
        status,
        uploaded_at: new Date().toISOString(),
      })
      upserts += 1
    }
  }
  console.log(`verification_documents backfill: ${upserts} row upsert(s)`)
}

async function sanityCheck() {
  const checks = [
    'platform_ca_accounts',
    'service_request_applications',
    'service_request_fulfillments',
    'verification_documents',
    'field_events',
  ]
  for (const table of checks) {
    const { error } = await supabase.from(table).select('*', { count: 'exact', head: true })
    if (error) console.warn(`sanity ${table}: FAIL — ${error.message}`)
    else console.log(`sanity ${table}: ok`)
  }

  const { error: colErr } = await supabase
    .from('campaigns')
    .select('id, lead_ngo_user_id')
    .limit(1)
  if (colErr) console.warn(`sanity campaigns.lead_ngo_user_id: FAIL — ${colErr.message}`)
  else console.log('sanity campaigns.lead_ngo_user_id: ok')
}

async function main() {
  await sanityCheck()
  await backfillCampaignLeadNgo()
  await backfillVerificationDocuments()
  console.log('done')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
