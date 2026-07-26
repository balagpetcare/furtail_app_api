# Furtail App API

## Purpose

Furtail App API is a minimal, mobile-facing API built to serve the Furtail
Flutter application (`furtail_app`). It is being constructed as the
long-term replacement for the legacy `furtail_api` backend.

## Migration relationship with `furtail_api`

This project is **not** a fork, rename, or copy of `furtail_api`. It is a
clean, purpose-built implementation created and verified endpoint by
endpoint alongside the legacy system. `furtail_api` is used strictly as a
read-only architectural reference during this process — its source,
schema, migrations, and configuration are not copied into this project.

`furtail_app_api` will run in parallel with `furtail_api` during the
migration period. Once every endpoint required by `furtail_app` has been
reimplemented here and independently verified, traffic will be cut over
from the legacy API to this one.

## Ports

- Legacy API (`furtail_api`): **7200**
- New API (`furtail_app_api`): **7300**

Running both APIs on distinct ports allows them to operate side by side
during migration without conflict.

## Package manager

This project uses **npm exclusively**. No other package manager (pnpm,
yarn, bun) is used or supported. Only `package-lock.json` is considered a
valid lockfile for this project.

## Migration status

- **Production cutover has not occurred.** `furtail_api` remains the
  authoritative, production-serving backend for the Furtail Flutter app.
- The Flutter app's API configuration has not been changed and continues
  to point at `furtail_api`.
- This repository currently contains a runtime foundation (Express server,
  typed error handling, health/readiness/version endpoints, tooling) with
  **no business modules, no database connection, and no authentication**
  implemented yet.

## Prerequisites

- Node.js **24.x** (see [Runtime policy](#runtime-policy) below)
- npm **11.16.0** (bundled with Node 24; pinned via `packageManager` in
  `package.json`) — this project uses npm exclusively, no other package
  manager is supported

## Installation

```bash
npm install
```

Installs exact, pinned dependency versions from `package-lock.json`. No
database, Redis, queue, or storage client is installed at this stage.

## Environment setup

Copy the template and adjust values as needed:

```bash
cp .env.example .env
```

Every variable has a safe default (see `src/config/env.ts`), so the API
boots in development mode on port 7300 even without a `.env` file. Invalid
values (e.g. a non-numeric `PORT`) fail startup immediately with a clear,
secret-free validation error rather than starting in a broken state.

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | `development` \| `test` \| `production` |
| `PORT` | `7300` | HTTP listen port |
| `LOG_LEVEL` | `info` | pino log level |
| `CORS_ALLOWED_ORIGINS` | *(empty — no origins allowed)* | comma-separated allowlist |
| `REQUEST_TIMEOUT_MS` | `30000` | per-request processing timeout |
| `SERVICE_NAME` | `furtail-app-api` | reported by `/api/v1/version` |
| `SERVICE_VERSION` | `0.1.0` | reported by `/api/v1/version` |

## Development commands

| Command | Purpose |
|---|---|
| `npm run dev` | Run the API with hot reload (`tsx watch`) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled build (`node dist/server.js`) |
| `npm run typecheck` | Type-check without emitting output |
| `npm run lint` | ESLint |
| `npm run format` | Prettier — write |
| `npm run format:check` | Prettier — check only |
| `npm test` | Run the Jest suite |
| `npm run test:coverage` | Run tests with coverage |
| `npm run check` | typecheck + lint + format:check + test + build, in order |

## Health endpoints

- `GET /health` — liveness only; never checks a downstream dependency.
- `GET /ready` — readiness; currently reports `database`, `redis`, `queue`,
  `storage`, and `auth` as `NOT_CONFIGURED` for every dependency, since none
  are wired up yet. Update this endpoint's implementation as each
  integration is actually added in a later step — do not mark a dependency
  ready without a real connectivity check.
- `GET /api/v1/version` — service name, API version, application version,
  environment, and process uptime. Never exposes filesystem paths or
  configuration values.

Every response uses a standard envelope (`{ success, data | error, meta }`)
and echoes an `X-Request-Id` response header.

## Runtime policy

**Node.js 24 LTS is the selected production baseline for this project.**
`engines.node` in `package.json` requires `>=24.0.0 <25.0.0`, and
`packageManager` pins `npm@11.16.0`. `.nvmrc` and `.node-version` both
specify `24` for tooling that reads those files (nvm, fnm, Volta, some CI
runners, some editor integrations).

- **Node 24 — selected baseline.** Verified against the actually-installed
  Node 24.18.0 development runtime; all commands in this project (install,
  build, test, run) are executed on Node 24.
- **Node 22 — not the selected baseline.** An earlier version of this
  project targeted Node 22 as an interim floor above `furtail_api`'s Node
  20 pin. That decision has been superseded: this project now standardizes
  specifically on Node 24.
- **Node 20 — unsupported.** `furtail_api`'s own Docker image pins Node 20
  (`node:20-bookworm-slim`), which reached its official Node.js
  End-of-Life (2026-04-30) before this project existed. Node 20 is not
  supported for `furtail_app_api` at any point.

See `migration-reports/04A-foundation-hardening.md` for the full rationale
and `migration-reports/04-foundation-scaffold.md` for the original (now
superseded on this point) Node 22 decision.

## Current exclusions

The following are deliberately **not** present yet and are tracked for
later steps, not omissions:

- No Prisma schema, migrations, or generated client
- No database, Redis, queue, or object-storage connection of any kind
- No authentication/Central Auth integration (the `furtail-mobile` contract
  is preserved as a future step, not implemented here)
- No business modules (profiles, posts, pets, adoption, fundraising,
  wallet, notifications, etc.)
- No production deployment configuration

## Status

Runtime foundation scaffolded and verified (see
`migration-reports/04-foundation-scaffold.md`). Business modules,
authentication, and persistence are not yet implemented.
