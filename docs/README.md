# Navadrishti docs

| File | Contents |
|------|----------|
| [TECHNICAL_README.md](./TECHNICAL_README.md) | Roles, workflows, API and page inventory, known gaps |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | How the app is put together |
| [API_REFERENCE.md](./API_REFERENCE.md) | Request/response examples for the main endpoints |
| [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) | Tables and naming conventions |
| [VERIFICATION_FLOW.md](./VERIFICATION_FLOW.md) | User verification and the CA console |
| [ENVIRONMENT.md](./ENVIRONMENT.md) | Environment variables |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Building and deploying |

## Running locally

```bash
cp .env.example .env.local
pnpm install
pnpm dev
```

The app runs on `http://localhost:3000`; the admin console is at `/admin`.

## User types

- **NGOs** publish needs and projects, apply to capability offers, and act as Lead NGO on CSR work.
- **Individuals** volunteer for needs and publish capability offers.
- **Companies** run CSR campaigns, fund projects, and manage evidence reviewers.
- **Consoles**: platform admin, Navadrishti CA, company evidence review.

## AI suite

- **Atlas**: NGO project and need drafting (`/ngos/ai-agent`)
- **Catalyst**: CSR campaign drafting (`/companies/csr-agent`)
- **Pulse**: offer and NGO matching used inside both flows

Labels live in `lib/ai-agent-sessions.ts`.
