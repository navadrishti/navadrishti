# Database Declutter Urgent Plan

## Objective

Stabilize flow quickly, remove ambiguity, and prepare safe schema cleanup without breaking production.

## 0-2 Hours: Freeze and Measure

1. Freeze destructive schema changes until audit finishes.
2. Take backup/snapshot of production and staging.
3. Run all sections in reference/db_declutter_audit.sql.
4. Export results and classify every table into:
   - core
   - extension
   - archive-candidate
   - unknown

## 2-6 Hours: Resolve Clarity Gaps

1. Use docs/DATABASE_SCHEMA.md as canonical mapping.
2. Confirm naming consistency across code and DB.
3. Prioritize these high-risk overlap zones:
   - service_volunteers as both application and assignment ledger
   - post_reactions vs post_interactions boundary
   - notifications naming drift (use user_notifications)

## 6-24 Hours: First Safe Cleanup Batch

1. Add missing FK indexes from audit output.
2. Add unique constraints where duplicates are not allowed by business rules.
3. Archive old operational data (tracking events, old support messages) into archive tables if retention allows.
4. Fix orphans only after confirming ownership flows.
5. Update dashboards/API docs to match canonical table names.

## Next 2-7 Days: Controlled Structural Simplification

1. Split overloaded tables only if justified by product flow:
   - Example: split service_volunteers into assignment and fulfillment tables if complexity keeps growing.
2. Introduce migration with dual-write strategy:
   - Release A: write old + new, read old
   - Release B: read new, validate parity
   - Release C: deprecate old
3. Add db_cleanup_registry records for every planned table/action.

## Strict Safety Rules

1. No DROP TABLE directly in production.
2. No deletes without backup table and dry-run query.
3. Every cleanup query must have rollback notes.
4. Deploy schema migrations with app code in the same release plan.
5. Validate user flows after each batch:
   - service request creation and assignment
   - service offer engagement
   - social post/comment/reaction
   - verification status checks
   - support ticket lifecycle

## Success Criteria

1. Every active API table exists and is documented.
2. No duplicate business rows in critical tables.
3. No FK orphans in primary workflow tables.
4. Query latency improves on hot endpoints.
5. Team can answer ownership of each table in under 30 seconds.
