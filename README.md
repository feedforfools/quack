# Quack

> Spot the cialtrone. A real-time social deduction party game.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Type-check + production build |
| `npm run preview` | Preview production build locally |
| `npm run typecheck` | `tsc --noEmit` across all tsconfigs |
| `npm run lint` | ESLint (fails on warnings in CI) |
| `npm run format` | Prettier write |
| `npm run format:check` | Prettier check (CI gate) |
| `npm run test` | Vitest unit tests (single run) |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:coverage` | Vitest with v8 coverage report |
| `npm run test:e2e` | Playwright E2E (requires `npm run build` first) |
| `supabase start` | Boot local Supabase stack (Docker required) |
| `supabase stop` | Stop local stack |
| `supabase status` | Print local service URLs and keys |

## Local setup

```sh
cp .env.example .env.local
# Fill in VITE_SUPABASE_ANON_KEY from `supabase status` (Publishable key)
npm install
supabase start
npm run dev
```

## Folder map

```
src/
  app/            Providers and router root (Epic 1+)
  features/       Feature slices (room, round, identity, host, settings)
  lib/
    supabase/     Typed Supabase client
    realtime/     Presence, broadcast, reconnect helpers
    words/        Word-pool loaders
    i18n/         Locale resource bundles
    log.ts        Dev-only console wrapper
  components/     Shared UI primitives
  pages/          Route-level components
  test/           Vitest setup

tests/
  unit/           Vitest unit tests
  e2e/            Playwright tests

supabase/
  migrations/     SQL migrations + RLS policies
  config.toml     Local stack configuration

public/
  words/          Static JSON word pools (lang/category)
```

## Contribution rules

- **One PR per task.** Match the task ID from `_IMPLEMENTATION_PLAN.md` in the PR title.
- **Gate must be green before merge:** `typecheck && lint && test && build`.
- **Playwright runs on every PR** via CI; fix before merging.
- **No secrets in source.** Use `.env.local` locally; CI injects secrets via GitHub Actions secrets.
- **Never log role or word payload.** Use `log.*` from `src/lib/log.ts` for all diagnostic output.
- **Mobile-first, accessible.** All interactive elements must have a tap target ≥ 44 × 44 px (`spacing.tap`).
- **RLS is not optional.** Every table gets a policy in its migration; cover it with a Playwright test.
