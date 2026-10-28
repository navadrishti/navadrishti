# Deployment

The platform is deployed on Vercel from git. There is no Docker image or CI workflow in this repo.

## Local production build

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm start
```

`next build` fails on TypeScript errors (`ignoreBuildErrors` is off), so run `pnpm typecheck` before pushing.

## Vercel

- Framework preset: Next.js (default build command, pnpm detected from `pnpm-lock.yaml`)
- Environment variables: see [ENVIRONMENT.md](./ENVIRONMENT.md)
- Cron: `vercel.json` calls `/api/cron/daily-cleanup` daily at 12:00 UTC; the route requires `CRON_SECRET`
- Pushes to non-production branches create preview deployments

## Go-live (production database with RLS)

The Next.js API uses `SUPABASE_SECRET_KEY` (service role) on the server. That role bypasses RLS. Do not expect prod RLS to constrain API routes. RLS plus `supabase/rls-lockdown.sql` exist so the **publishable** key cannot dump tables if it leaks.

1. In the Vercel production environment, paste the **production** project values. Never commit them and never paste them into git or chat.
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (anon / publishable only)
   - `SUPABASE_SECRET_KEY` (service role / secret only)
   - `JWT_SECRET` (app signing secret, at least 32 characters; this is not the Supabase JWT secret)
   - Admin, Cloudinary, Razorpay **live** keys, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`
2. In the production Supabase SQL editor, run `supabase/rls-lockdown.sql` once. It enables RLS and revokes `anon` / `authenticated` on `public`. Re-run is safe.
3. Deploy. `GET /api/health` must return 200. A 503 includes `config_issues` naming missing or swapped keys (not the values).
4. `/api/health` reports missing or swapped keys as `config_issues`. Razorpay test keys are allowed until live payments are switched on. Do not put the secret key in any `NEXT_PUBLIC_*` variable.

## Health check

`GET /api/health` returns service status and checks database connectivity. In production it also fails if go-live secrets are missing or the wrong kind.

## Tests

```bash
pnpm test
```

Runs the Vitest suite in `tests/`.

## Database changes

Schema changes are applied manually in the Supabase SQL editor. Take a backup before running a migration, and deploy code that reads the new columns only after the SQL has run.

## Rollback

Promote the previous deployment from the Vercel dashboard, or:

```bash
vercel ls
vercel promote <deployment-url>
```

If the rollback crosses a schema change, check that the older code still works against the current columns.
