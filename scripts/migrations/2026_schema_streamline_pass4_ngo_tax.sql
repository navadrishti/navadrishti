-- GRAM / Navadrishti — schema streamline PASS 4
-- Add NGO GST/PAN verification columns on ngo_verifications.
-- Backfill from users.profile_data.ngo_tax_verification when present.
-- Idempotent.

BEGIN;

ALTER TABLE public.ngo_verifications
  ADD COLUMN IF NOT EXISTS gst_number character varying,
  ADD COLUMN IF NOT EXISTS gst_verified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS gst_verified_at timestamp without time zone,
  ADD COLUMN IF NOT EXISTS pan_number character varying,
  ADD COLUMN IF NOT EXISTS pan_verified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS pan_verified_at timestamp without time zone;

-- Backfill from temporary profile_data mirror (pass-3 interim)
UPDATE public.ngo_verifications nv
SET
  gst_number = COALESCE(nv.gst_number, NULLIF(tax.gst_number, '')),
  gst_verified = COALESCE(nv.gst_verified, false) OR COALESCE(tax.gst_verified, false),
  gst_verified_at = COALESCE(
    nv.gst_verified_at,
    CASE WHEN tax.gst_verified_at IS NOT NULL AND tax.gst_verified_at <> ''
      THEN tax.gst_verified_at::timestamp without time zone
      ELSE NULL
    END
  ),
  pan_number = COALESCE(nv.pan_number, NULLIF(tax.pan_number, '')),
  pan_verified = COALESCE(nv.pan_verified, false) OR COALESCE(tax.pan_verified, false),
  pan_verified_at = COALESCE(
    nv.pan_verified_at,
    CASE WHEN tax.pan_verified_at IS NOT NULL AND tax.pan_verified_at <> ''
      THEN tax.pan_verified_at::timestamp without time zone
      ELSE NULL
    END
  ),
  updated_at = now()
FROM (
  SELECT
    u.id AS user_id,
    NULLIF(TRIM(u.profile_data->'ngo_tax_verification'->>'gst_number'), '') AS gst_number,
    COALESCE((u.profile_data->'ngo_tax_verification'->>'gst_verified')::boolean, false) AS gst_verified,
    NULLIF(TRIM(u.profile_data->'ngo_tax_verification'->>'gst_verified_at'), '') AS gst_verified_at,
    NULLIF(TRIM(u.profile_data->'ngo_tax_verification'->>'pan_number'), '') AS pan_number,
    COALESCE((u.profile_data->'ngo_tax_verification'->>'pan_verified')::boolean, false) AS pan_verified,
    NULLIF(TRIM(u.profile_data->'ngo_tax_verification'->>'pan_verified_at'), '') AS pan_verified_at
  FROM public.users u
  WHERE u.user_type = 'ngo'
    AND u.profile_data ? 'ngo_tax_verification'
) tax
WHERE nv.user_id = tax.user_id
  AND (
    tax.gst_number IS NOT NULL
    OR tax.gst_verified = true
    OR tax.pan_number IS NOT NULL
    OR tax.pan_verified = true
  );

-- Optional cleanup: drop the interim profile key after backfill
UPDATE public.users
SET profile_data = profile_data - 'ngo_tax_verification',
    updated_at = now()
WHERE user_type = 'ngo'
  AND profile_data ? 'ngo_tax_verification';

COMMIT;
