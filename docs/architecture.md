# Architecture

> Placeholder — fill in architectural decisions before Prompt 1.

## Stack

- **Frontend**: Next.js 15 App Router, TypeScript strict, Tailwind, shadcn/ui
- **Backend**: Supabase (Postgres + Auth + RLS + Edge Functions)
- **Monorepo**: pnpm workspaces
  - `apps/web` — Next.js application
  - `packages/db` — migrations, generated types, seed scripts
  - `packages/shared` — Zod schemas, shared types, utilities

## Multi-tenancy

Row-Level Security enforced at the database layer via `is_org_member()` / `is_org_admin()` helper functions. Active org stored in session/cookie and passed as a claim.

## Auth

Supabase Auth with `@supabase/ssr` for server-side session management. Proxy (middleware) handles session refresh and route protection.

## CI/CD

GitHub Actions → Vercel (preview on PR, production on merge to main).
