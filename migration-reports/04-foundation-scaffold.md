# Step 4 — Foundation Scaffold

Generated: 2026-07-26T09:46:31Z

> **Superseded on runtime policy and dependency-security points**: this
> report's Node **22** decision and its documented `npm audit` findings
> (21 high-severity, all `jest@29.7.0`-transitive) were revisited in Step
> 4A. The project's runtime baseline is now **Node 24 LTS**, and the audit
> findings are now resolved to **0 vulnerabilities**. This file is kept
> unmodified below as an accurate historical record of Step 4's actual
> reasoning and results — see
> `migration-reports/04A-foundation-hardening.md` for the current,
> authoritative state.

## Detected runtime versions

| Tool | Detected version | Command |
|---|---|---|
| Node.js | v24.18.0 | `node --version` |
| npm | 11.16.0 | `npm --version` |

## Legacy runtime constraints (read-only inspection)

- `furtail_api`'s `package.json` has **no `engines` field**.
- `furtail_api`'s `dockerfile` pins `FROM node:20-bookworm-slim` — Node 20 ("Iron") is the legacy production runtime.
- `furtail_api` pins `typescript: 5.9.3` (exact) and `express: ^4.19.2` (Express 4, not 5).
- No `.nvmrc` or `.node-version` file exists in `furtail_api`.

## Selected runtime policy

**`engines.node: ">=22.0.0"`** — Node 22 (Active LTS) as the floor, verified against the installed Node 24.18.0.

**Rationale for diverging from legacy's Node 20 pin:** Node.js 20 ("Iron") reached its official End-of-Life on 2026-04-30, per the Node.js release schedule — before this scaffolding step (2026-07-26). Pinning a new codebase's `engines` field to an already-EOL major version would mean starting the replacement API on a runtime that no longer receives security patches. Node 22 is the appropriate floor for new work at this date; the installed development runtime (24.18.0) satisfies `>=22.0.0` and was used for every command in this step, so there is no conflict to stop on.

This divergence does not affect the confirmed architecture decisions (ports, package manager, migration mode) — it is purely a runtime-version choice, made because matching an EOL legacy pin would be a regression, not a compatibility requirement worth preserving.

**No installed-runtime-vs-selected-range conflict was found** — Node 24.18.0 satisfies `>=22.0.0`, so dependency installation proceeded.

## Exact dependencies and versions

All versions below were installed with `--save-exact` (no `^`/`~` ranges in `package.json`) so they are reproducible.

### Runtime dependencies

| Package | Version | Purpose |
|---|---|---|
| `express` | 4.22.2 | HTTP framework. Kept on the 4.x line to match `furtail_api`'s `express: ^4.19.2` contract (Express 5 has breaking middleware/routing changes not worth introducing at this stage). |
| `dotenv` | 17.4.2 | `.env` loading (no `.env` file is committed; only `.env.example`) |
| `zod` | 4.4.3 | Environment/schema validation |
| `cors` | 2.8.6 | Configurable CORS |
| `helmet` | 8.3.0 | Security headers |
| `compression` | 1.8.1 | Response compression |
| `pino` | 10.3.1 | Structured JSON logging |
| `pino-http` | 11.0.0 | HTTP request logging (built on `pino`) |

### Development dependencies

| Package | Version | Purpose |
|---|---|---|
| `typescript` | 5.9.3 | Matches `furtail_api`'s exact pinned version |
| `@types/node` | 24.13.3 | Matches the installed Node 24.x runtime (not the `>=22` engines floor — devDependency types track what's actually running locally) |
| `@types/express` | 4.17.25 | Matches Express 4's actual type contract. `furtail_api` itself pins the mismatched `@types/express: ^5.0.6` against `express: ^4.19.2` — not carried forward, since that combination is a known-incorrect pairing in the legacy project, not a compatibility requirement. |
| `@types/compression` | 1.8.1 | Required — `compression` ships no bundled types |
| `@types/cors` | 2.8.19 | Required — `cors` ships no bundled types |
| `tsx` | 4.23.1 | Development runner (`npm run dev`) |
| `eslint` | 10.8.0 | Linting (flat config) |
| `@eslint/js` | 10.0.1 | ESLint's recommended JS rule set |
| `typescript-eslint` | 8.65.0 | TypeScript-aware linting |
| `prettier` | 3.9.6 | Formatting |
| `jest` | 29.7.0 | Matches `furtail_api`'s exact pinned version |
| `ts-jest` | 29.4.12 | Compatible with the matched Jest 29 line (`furtail_api` pins `^29.4.6`; 29.4.12 is a same-minor-line patch resolved by npm) |
| `@types/jest` | 29.5.14 | Deliberately aligned to the Jest **29.x** line — `npm install` initially resolved `@types/jest@30.0.0` (latest), which doesn't match `jest@29.7.0`'s API surface; corrected before finalizing. |
| `supertest` | 7.2.2 | HTTP integration testing |
| `@types/supertest` | 7.2.1 | Type definitions for `supertest` |

**Known, documented vulnerability (not fixed, explained):** `npm audit` reports 21 high-severity advisories, all transitive dependencies of `jest@29.7.0` (`glob`/`brace-expansion`/`minimatch`, DoS-via-unbounded-expansion class). This is dev-tooling-only (never present in the compiled `dist/` output or production runtime) and is inherited by design from matching `furtail_api`'s own exact `jest: ^29.7.0` pin — `furtail_api` carries the identical exposure today. `npm audit fix --force` would downgrade to `jest@25.0.0`, an unacceptable regression. Not remediated in this step; flagged for a future Jest-major-upgrade decision made deliberately, not silently forced by an audit tool.

## Exact files created or modified

### Created

```
package.json
package-lock.json
tsconfig.json
tsconfig.build.json
eslint.config.js
prettier.config.js
.prettierignore
jest.config.js
.env.example
.gitattributes
src/app.ts
src/server.ts
src/config/env.ts
src/core/errors/app-error.ts
src/core/errors/error-codes.ts
src/core/http/api-response.ts
src/middleware/error-handler.ts
src/middleware/not-found.ts
src/middleware/request-context.ts
src/middleware/request-logger.ts
src/routes/health.routes.ts
src/routes/index.ts
src/shared/async-handler.ts
src/shared/logger.ts
src/shared/safe-json.ts
src/types/express.d.ts
tests/health.integration.test.ts
tests/safe-json.unit.test.ts
tests/setup-env.ts
migration-reports/04-foundation-scaffold.md (this file)
```

`.gitignore` from Step 2 already covers `node_modules/`, `dist/`, `coverage/`, `.env`, `.env.*` (with `!.env.example` exempted) — no changes needed there.

### Modified

```
README.md   -- added prerequisites, installation, development commands,
               environment table, health endpoints, runtime policy,
               current exclusions
```

`.git` was initialized (see below) but no commit was created.

## Exact commands executed

Runtime detection:
```
node --version
npm --version
npm config get registry
```

Legacy reference inspection (read-only):
```
grep -n "\"engines\"" -A5 furtail_api/package.json
grep -n "\"typescript\"|\"express\"|\"@types/node\"|\"@types/express\"" furtail_api/package.json
cat furtail_api/.nvmrc
find furtail_api -iname "*.dockerfile" -o -iname "dockerfile"
cat furtail_api/dockerfile
find furtail_api -iname ".eslintrc*" -o -iname "eslint.config*" -o -iname ".prettierrc*" -o -iname "prettier.config*"
grep -n "\"eslint\"|\"prettier\"|\"jest\"|\"ts-jest\"|\"supertest\"|\"tsx\"|\"ts-node\"" furtail_api/package.json
```

Git initialization:
```
git init
git rev-parse --is-inside-work-tree
git status
```
(No `git add`, `git commit`, or `git remote add` was run.)

Project initialization and dependency installation:
```
npm init -y
npm install --save-exact express@^4.19.2 dotenv zod cors helmet compression pino pino-http
npm install --save-exact --save-dev typescript@5.9.3 jest@^29.7.0 ts-jest@^29.4.6
npm install --save-exact --save-dev @types/node@^24 @types/express@^4.17 @types/jest tsx eslint @eslint/js typescript-eslint prettier supertest @types/supertest
npm view @types/jest@^29 version
npm install --save-exact --save-dev @types/jest@^29
npm install --save-exact --save-dev @types/compression @types/cors
```

Verification/build loop (each run at least once; iterated until clean):
```
npx tsc -p tsconfig.json --noEmit
npx jest --config jest.config.js
npx eslint .
npx prettier --check .
npx prettier --write .
npx tsc -p tsconfig.build.json
npm run check
```

Runtime verification:
```
NODE_ENV=production PORT=7300 node dist/server.js   (backgrounded, temporary)
curl -i http://localhost:7300/health
curl -i http://localhost:7300/ready
curl -i http://localhost:7300/api/v1/version
netstat -ano | grep ":7300" | grep LISTENING        (before and after stop)
tasklist | grep -i node.exe
```

Final verification:
```
node -e "JSON.parse(readFileSync('package.json'))"
node -e "JSON.parse(readFileSync('package-lock.json'))"
find . -maxdepth 1 -iname "pnpm-lock.yaml" -o -iname "yarn.lock" -o -iname "bun.lockb" -o -iname "package-lock.json"
find . -maxdepth 1 -iname ".env"
grep -E "\"(pg|prisma|@prisma|ioredis|redis|bullmq|amqplib|@aws-sdk|minio)\"" package.json
git -C furtail_api status
git -C furtail_app status
find . (final tree, node_modules/.git excluded)
```

## Test and build results

- `npm run typecheck` — **passed**, zero errors.
- `npm run lint` — **passed**, zero errors/warnings.
- `npm run format:check` — **passed**, all matched files conform (migration-reports/docs/README explicitly excluded via `.prettierignore` — they are content documents from Steps 2–3, not source code, and reformatting them was out of this step's scope).
- `npm test` — **14/14 tests passed**, 2 suites (`tests/safe-json.unit.test.ts`, `tests/health.integration.test.ts`).
- `npm run build` — **succeeded**, emitted `dist/` with `dist/server.js` present, matching `package.json`'s `main` field.
- `npm run check` (typecheck → lint → format:check → test → build, in that order) — **all steps passed** end-to-end in a single run.

## Local run command

```bash
npm run dev        # hot-reload development server
# or
npm run build && npm start   # compiled production-style run
```

Server listens on `PORT` (default 7300). Verified endpoints:
- `GET /health` → 200, `{"status":"alive"}`
- `GET /ready` → 200, all five dependencies (`database`, `redis`, `queue`, `storage`, `auth`) reported `NOT_CONFIGURED`
- `GET /api/v1/version` → 200, service/version/environment/uptime, no filesystem paths

## Known limitations

1. **`npm audit` reports 21 high-severity dev-tooling vulnerabilities** (Jest 29's transitive `glob`/`brace-expansion` chain) — documented above, not fixed, inherited from matching `furtail_api`'s own Jest pin. Not a production runtime exposure.
2. **`ts-jest@29.4.12`** resolved rather than the exact `^29.4.6` `furtail_api` pins — both are within the same minor line; npm resolved the latest compatible patch since no exact legacy value was mandated for this specific package (only Jest and TypeScript's exact versions were explicitly matched).
3. **CORS defaults to fully closed** (`origin: false`) when `CORS_ALLOWED_ORIGINS` is unset — intentional secure-by-default behavior, but means the API will reject all cross-origin browser requests until a deployment explicitly sets this variable. Documented in `.env.example` and `README.md`.
4. **No `packageManager` field** was added to `package.json` (e.g. Corepack-style `"packageManager": "npm@..."`) — not requested by the task, and `engines.node` plus the sole `package-lock.json` already establish npm as authoritative; can be added later if the team wants Corepack enforcement.
5. **The `/ready` endpoint's dependency list is hardcoded** to the five named dependencies with static `NOT_CONFIGURED` values — by design for this step (no real connectivity checks exist yet), but each entry must be revisited and wired to an actual check as that specific integration is built in a later step, not simply flipped to `"CONFIGURED"` without a real probe.
6. **`allow-scripts` warning for `esbuild`'s postinstall** appeared during `tsx` installation in this npm/environment configuration; verified `tsx` and its platform-specific `esbuild` binary (`win32-x64`) work correctly regardless (`npx tsx --version` succeeded), so this did not block or degrade the foundation, but is noted for transparency.

## Next recommended step

Do not scaffold business modules, authentication, or a Prisma schema yet, per this step's explicit boundary. The next step should design the Prisma schema for the first migration-order module identified in Step 3 (`03-flutter-api-inventory.md` recommends master/reference data — animal types, breeds, location hierarchy — as the lowest-risk starting point), still without connecting to any real database in that design step, before any actual persistence or business-endpoint implementation begins.
