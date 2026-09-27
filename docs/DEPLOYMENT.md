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

## Health check

`GET /api/health` returns service status and checks database connectivity.

## Tests

```bash
pnpm test
```

Runs the Vitest suite in `tests/`. `tests/security.test.ts` checks the security headers, source map settings, and that client components do not import server-only modules; the other files cover pricing, auth tokens, need allocation and campaign lead helpers.

## Database changes

Schema changes are applied manually in the Supabase SQL editor. Take a backup before running a migration, and deploy code that reads the new columns only after the SQL has run.

## Rollback

Promote the previous deployment from the Vercel dashboard, or:

```bash
vercel ls
vercel promote <deployment-url>
```

If the rollback crosses a schema change, check that the older code still works against the current columns.
