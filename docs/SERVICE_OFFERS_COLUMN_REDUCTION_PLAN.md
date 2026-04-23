# Service Offers Column Reduction Plan

## Summary

The current codebase is now aligned to a minimal offer input model:

- Offer Title
- Description
- Offer Type
- Offer Mode
- Amount (INR)
- Location Scope
- Conditions (optional)

with system columns like id/creator/status/timestamps/admin review metadata.

## High-Risk Findings (fix first)

1. `provider_id` relation is legacy; service offers owner column is `creator_id`.
   - File: app/api/platform-activities/route.ts
   - Impact: If `provider_id` is removed or not present, this endpoint fails.

2. Admin UI still depends on legacy display fields.
   - File: app/admin/page.tsx
   - Keep these for now: `wage_info`, `employment_type`, `experience_requirements`, `skills_required`, `duration`.

3. Multiple APIs use `select('*')` for `service_offers`.
   - Files: app/api/service-offers/route.ts, lib/db.ts, app/api/admin/service-offers/route.ts, app/api/admin/service-offers/[offerId]/review/route.ts
   - Impact: Dropping columns can cause implicit coupling and hidden runtime issues.

4. `submitted_for_review_at` is used by analytics/auto-reject.
   - Files: app/api/admin/analytics/route.ts, app/api/admin/service-offers/auto-reject/route.ts, app/api/cron/daily-cleanup/route.ts
   - Impact: If dropped, review SLA metrics and auto-reject no longer work.

## Recommended Minimal Core Columns

Keep these as physical columns:

- id
- creator_id
- title
- description
- offer_type
- location_scope (optional physical column; can remain in requirements)
- amount (optional physical column; can remain in requirements)
- conditions (optional physical column; can remain in requirements)
- transaction_type (optional physical column; can remain in requirements)
- category
- location
- price_type
- price_amount
- price_description
- requirements (jsonb)
- status
- admin_status
- admin_reviewed_at
- admin_reviewed_by
- admin_comments
- submitted_for_review_at
- created_at
- updated_at

## Good Candidates To Remove (after code cleanup)

These should be moved into `requirements` or dropped if not needed:

- item
- quantity
- delivery_scope
- skill
- capacity
- duration (top-level)
- scope
- budget_range
- contact_info
- images
- tags
- verified
- city
- state_province
- pincode
-- Keep for admin screen: wage_info, employment_type, experience_requirements, skills_required, duration
- benefits
- provider_id

## Safer Migration Sequence

1. Replace `select('*')` with explicit selects in all `service_offers` queries.
2. Keep admin-dependent columns until admin UI is intentionally refactored.
3. Ensure activity feed join uses `creator_id` instead of `provider_id`.
4. Backfill any needed values into `requirements` JSON.
5. Drop legacy columns in batches.
6. Add CI/runtime checks for service-offers endpoints.

## Validation Checklist

- Service offer list page loads and filters by search/category/location.
- Service offer details page renders all offer types.
- Create and edit flow only requires: title, description, offer type, offer mode, amount, location scope, conditions.
- Admin pending/approved/rejected tabs and review modal still render.
- Auto-reject cron still identifies pending records by `submitted_for_review_at`.
- Activity feed still shows recently posted service offers.
