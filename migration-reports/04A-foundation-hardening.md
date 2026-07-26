# Step 4A — Foundation Hardening

Generated: 2026-07-26T10:12:59Z

## Objectives (restated)

- Standardize `furtail_app_api` on Node.js 24 LTS (superseding Step 4's Node 22 decision).
- Resolve or rigorously document the `npm audit` findings inherited from Step 4.
- Preserve all passing foundation behavior — no regressions.

## Exact files modified or created

### Modified

```
package.json               -- engines.node -> ">=24.0.0 <25.0.0"; added
                               packageManager field; added overrides
                               (babel-plugin-istanbul, brace-expansion);
                               jest/@types/jest bumped to the 30.x line
package-lock.json           -- regenerated (npm install, then npm dedupe)
README.md                   -- Runtime policy section rewritten: Node 24
                               LTS is the selected baseline; Node 22 is
                               explicitly not the baseline (superseded);
                               Node 20 explicitly unsupported; no claim
                               that Node 22 is Active LTS
migration-reports/04-foundation-scaffold.md
                             -- added a superseded-notice banner at the top
                               pointing to this report; historical content
                               below the banner left unmodified (accurate
                               record of what Step 4 actually did/decided)
```

### Created

```
.nvmrc                      -- "24"
.node-version                -- "24"
migration-reports/04A-foundation-hardening.md   (this file)
```

No file under `src/`, `tests/`, or any config file governing typecheck/lint/format/test/build behavior (`tsconfig.json`, `tsconfig.build.json`, `eslint.config.js`, `prettier.config.js`, `jest.config.js`) was changed — all passing foundation behavior from Step 4 was preserved without modification to application code.

## Original and final Node/npm policy

| | Original (Step 4) | Final (Step 4A) |
|---|---|---|
| Installed Node (this machine) | v24.18.0 | v24.18.0 (re-verified, unchanged) |
| Installed npm (this machine) | 11.16.0 | 11.16.0 (re-verified, unchanged) |
| `package.json` `engines.node` | `>=22.0.0` | `>=24.0.0 <25.0.0` |
| `package.json` `packageManager` | *(absent)* | `npm@11.16.0` |
| `.nvmrc` | *(absent)* | `24` |
| `.node-version` | *(absent)* | `24` |
| Documented rationale | Node 22 chosen as "Active LTS," above legacy's EOL Node 20 | Node 24 is the selected production baseline; Node 22 explicitly stated as *not* selected (superseded decision, not restated as Active LTS); Node 20 explicitly stated as unsupported |

`node --version` / `npm --version` were re-run at the start of this step and produced identical output to Step 4 (v24.18.0 / 11.16.0) — no runtime change occurred on this machine; only the declared policy in the project changed to match.

## Original and final dependency versions

Only the Jest-related chain changed. Every other dependency (`express`, `dotenv`, `zod`, `cors`, `helmet`, `compression`, `pino`, `pino-http`, `typescript`, `@types/node`, `@types/express`, `@types/compression`, `@types/cors`, `@types/supertest`, `tsx`, `eslint`, `@eslint/js`, `typescript-eslint`, `prettier`, `supertest`) is untouched from Step 4, at the exact same pinned version.

| Package | Step 4 (original) | Step 4A (final) | Change |
|---|---|---|---|
| `jest` | 29.7.0 | 30.4.2 | Major upgrade — see rationale below |
| `@types/jest` | 29.5.14 | 30.0.0 | Realigned to match the new Jest major |
| `ts-jest` | 29.4.12 | 29.4.12 | **Unchanged.** Its own `peerDependencies` already declare `"jest": "^29.0.0 || ^30.0.0"`, so no version bump was needed for Jest 30 compatibility. |
| *(new)* `overrides.babel-plugin-istanbul` | *(none)* | `8.0.2` | Forces the patched transitive chain (see below) |
| *(new)* `overrides.brace-expansion` | *(none)* | `5.0.8` | Forces the patched leaf package everywhere it appears (see below) |

**Why Jest was upgraded rather than kept at `furtail_api`'s pinned 29.7.0:** 29.7.0 is already the newest release in the 29.x line (`npm view jest versions` confirms no later 29.x patch exists), so the advisory could not be resolved by a same-major patch bump — only a major upgrade could reach a version whose own dependency tree uses a patched `glob`. Per this step's explicit instruction to "prefer upgrading to maintained compatible releases rather than matching the legacy API's old test versions," Jest 30 was selected over attempting to hold the legacy pin.

**Compatibility verified, not assumed:** after the upgrade, `npm run check` (typecheck, lint, format:check, all 14 existing tests, build) passed unmodified, and `npm run test:coverage` was additionally run to confirm Istanbul-based coverage collection still functions correctly under the `babel-plugin-istanbul` override (see coverage table in "npm run check results" below). No test file, `jest.config.js`, or `tsconfig.json` needed a single change for the Jest 30 upgrade to work.

## Original and final `npm audit` totals

| | info | low | moderate | high | critical | total |
|---|---|---|---|---|---|---|
| **Original (Step 4)** | 0 | 0 | 0 | 21 | 0 | 21 |
| **After Jest 29→30 upgrade alone** | 0 | 0 | 0 | 20 | 0 | 20 |
| **After `babel-plugin-istanbul` override** | 0 | 0 | 0 | 20 | 0 | 20 |
| **Final (after `brace-expansion` override)** | 0 | 0 | 0 | **0** | 0 | **0** |

**Target achieved: zero high or critical advisories**, without `npm audit fix --force` and without downgrading any package.

## Advisory identification and dependency paths

All 21 original advisories trace back to a **single root advisory**: [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg) — `brace-expansion`, DoS via unbounded expansion length causing an out-of-memory crash (CVSS 7.5, high, CWE-400/CWE-770), affecting `brace-expansion <=5.0.7`. The 20 other flagged packages (`glob`, `minimatch`, `jest`, `@jest/core`, `@jest/reporters`, `@jest/transform`, `jest-runtime`, `jest-config`, `jest-circus`, `jest-cli`, `jest-runner`, `jest-snapshot`, `jest-resolve-dependencies`, `@jest/expect`, `@jest/globals`, `create-jest`, `babel-jest`, `babel-plugin-istanbul`, `test-exclude`, `ts-jest`) were all `npm audit`-reported only because they **depend on** the vulnerable `brace-expansion`, directly or transitively — not independent vulnerabilities.

**Runtime vs. dev-only, verified by dependency-path inspection (not assumed):** every one of the 21 affected packages is reachable only from `devDependencies` (`jest`, `ts-jest`, `eslint`, `typescript-eslint` and their own transitive trees). `npm ls <package>` was run for each root/near-root package to confirm this — none appear under `dependencies` or in the compiled `dist/` build output. This is dev-tooling-only exposure (test runner and linter internals), never shipped to a running production process. This conclusion is stated here only after tracing the actual paths below, not asserted a priori.

### Path 1 (fixed by the Jest 29→30 upgrade)

```
jest@29.7.0
  -> @jest/core@29.7.0
    -> @jest/reporters@29.7.0
      -> glob@7.2.3
        -> minimatch@3.1.5
          -> brace-expansion@1.1.16   [VULNERABLE, <=5.0.7]
```

Jest 30's `@jest/reporters@30.4.1` depends on `glob@^10.5.0` instead of `glob@7.2.3`. `glob@10.5.0`'s own `minimatch@9.0.9` pulls a newer `brace-expansion`, closing this specific path.

### Path 2 (fixed by the `babel-plugin-istanbul` override)

```
ts-jest@29.4.12
  -> @jest/transform@30.4.1        (Jest 30's own package, via peer resolution)
    -> babel-plugin-istanbul@7.0.1  (highest 7.x satisfying @jest/transform's "^7.0.1" range)
      -> test-exclude@6.0.0         (babel-plugin-istanbul@7.0.1 pins "^6.0.0", NOT ^7)
        -> minimatch@3.1.5
          -> brace-expansion@1.1.16   [VULNERABLE, <=5.0.7]
```

`@jest/transform@30.4.1` (an internal Jest package we don't select directly) declares `"babel-plugin-istanbul": "^7.0.1"`. The highest published 7.x release, `7.0.1`, still pins `test-exclude: ^6.0.0` — `test-exclude@6.0.0` is the same old package that carries the vulnerable `minimatch`/`brace-expansion` chain. `babel-plugin-istanbul@8.0.2` (a real major-version upgrade of that package, verified compatible: `engines.node: ">=18"`, and functionally confirmed via `npm run test:coverage` above) depends on `test-exclude: ^7.0.1`, whose latest release (`test-exclude@7.0.2`) depends on `minimatch: ^10.2.2` — a patched line. **`overrides.babel-plugin-istanbul: "8.0.2"`** forces this substitution project-wide. This is not `npm audit fix --force` (a different, npm-native command that would have instead suggested downgrading `ts-jest` to `29.1.2`, an *older*, obsolete release — rejected per the rule against downgrading to obsolete versions); `overrides` is npm's standard, explicit mechanism for pinning a transitive dependency's resolved version without touching the direct dependency that requested it.

### Path 3 (fixed by the `brace-expansion` override — the final gap)

After both changes above, one instance remained:

```
jest@30.4.2
  -> @jest/core@30.4.2
    -> @jest/reporters@30.4.1
      -> glob@10.5.0
        -> minimatch@9.0.9
          -> brace-expansion@2.1.2   [still VULNERABLE — 2.1.2 <= 5.0.7]
```

`brace-expansion`'s own release history shows the fix landed specifically at `5.0.8` (versions `2.1.0`–`2.1.2`, `3.0.0`–`4.0.1`, and `5.0.2`–`5.0.7` are all still within the advisory's `<=5.0.7` vulnerable range — `brace-expansion` uses a synchronized version-numbering scheme across a `2.x`→`5.x` range that does not correspond to conventional independent-package semver majors). `minimatch@9.0.9` (used by `glob@10.5.0`) depends on `brace-expansion: ^2.0.1`, which resolves to `2.1.2` — inside the vulnerable range despite being a "newer-looking" 2.x version. **`overrides.brace-expansion: "5.0.8"`** forces every instance of this small, dependency-free leaf package to the patched release, regardless of which parent requested an older range. Verified via `npm ls brace-expansion` after the override: every resolved instance in the tree (under `eslint`, `jest`, `ts-jest`/`babel-plugin-istanbul`, `typescript-eslint`) now reads `brace-expansion@5.0.8`.

### Remediation summary

| Advisory root | Fix type | Breaking? | Applied |
|---|---|---|---|
| `glob@7.2.3` chain (Jest's own reporter) | Non-breaking from our API's perspective (Jest major upgrade, but no test/config code changed) | Semver-major for `jest`/`@types/jest` | Yes — direct dependency upgrade |
| `babel-plugin-istanbul@7.0.1` chain (internal to `@jest/transform`) | Forced transitive upgrade via `overrides` | Semver-major for the overridden package, transparent to our code | Yes — `npm overrides` |
| `minimatch@9.0.9`'s `brace-expansion@2.1.2` (internal to `glob@10.5.0`) | Forced leaf-package upgrade via `overrides` | No (leaf utility package, stable API) | Yes — `npm overrides` |

No non-breaking fix existed for paths 2 and 3 (npm's own `fixAvailable` suggestion for the original advisory was to downgrade `jest` to `25.0.0`, an obsolete major — explicitly rejected per this step's rules). The `overrides` mechanism achieved the equivalent of a non-breaking outcome for our own code (nothing in `src/`, `tests/`, or config needed to change) while still being a "breaking" change from the overridden packages' own semver perspective — which is the correct, sanctioned use of `overrides` for exactly this class of problem.

## Exact commands executed

Runtime re-verification:
```
node --version
npm --version
```

Baseline audit capture:
```
npm audit --json > <scratchpad>/audit-before.json
node -e "... parse and summarize audit-before.json ..."
npm ls brace-expansion
```

Research (read-only npm registry queries, no installs):
```
npm view jest versions --json
npm view jest@30.4.2 dependencies
npm view @jest/reporters versions --json
npm view @jest/reporters@30.4.1 dependencies --json
npm view ts-jest versions --json
npm view ts-jest@29.4.12 peerDependencies --json
npm view test-exclude versions --json
npm view test-exclude@latest dependencies --json
npm view test-exclude@7.0.2 dependencies --json
npm view babel-plugin-istanbul versions --json
npm view babel-plugin-istanbul@latest dependencies --json
npm view babel-plugin-istanbul@7.0.1 dependencies --json
npm view babel-plugin-istanbul@8.0.2 dependencies --json
npm view babel-plugin-istanbul@8.0.2 engines --json
npm view brace-expansion versions --json
```

Dependency changes:
```
npm install --save-exact --save-dev jest@30.4.2 @types/jest@30.0.0
npm audit --json > <scratchpad>/audit-mid.json   (confirmed 20 remaining)
npm ls babel-plugin-istanbul
npm ls brace-expansion
# package.json edited: added overrides.babel-plugin-istanbul = "8.0.2"
npm install
npm ls babel-plugin-istanbul   (confirmed override applied)
npm ls brace-expansion         (confirmed remaining gap: glob's minimatch@9.0.9 -> brace-expansion@2.1.2)
# package.json edited: added overrides.brace-expansion = "5.0.8"
npm install
npm audit --json > <scratchpad>/audit-after.json   (confirmed 0)
npm dedupe
npm ls brace-expansion   (confirmed all instances now 5.0.8)
```

Policy files:
```
# package.json edited: engines.node -> ">=24.0.0 <25.0.0"; added packageManager
# .nvmrc created: "24"
# .node-version created: "24"
# README.md edited: Runtime policy section rewritten
# migration-reports/04-foundation-scaffold.md edited: superseded-notice banner added
```

Regression verification:
```
npm run check
npm run test:coverage
NODE_ENV=production PORT=7300 node dist/server.js   (backgrounded, temporary)
curl -s -o /dev/null -w "HTTP_STATUS:%{http_code}\n" http://localhost:7300/health
curl -s http://localhost:7300/health
curl -s -o /dev/null -w "HTTP_STATUS:%{http_code}\n" http://localhost:7300/ready
curl -s http://localhost:7300/ready
curl -s -o /dev/null -w "HTTP_STATUS:%{http_code}\n" http://localhost:7300/api/v1/version
curl -s http://localhost:7300/api/v1/version
netstat -ano | grep ":7300" | grep LISTENING   (before and after stop)
# Stop-Process -Id <pid> -Force
find . -maxdepth 1 -iname ".env"
find . -not -path "*/node_modules/*" -iname "pnpm-lock.yaml" -o -iname "yarn.lock" -o -iname "bun.lockb"
git -C furtail_api status
git -C furtail_app status
node -e "JSON.parse(readFileSync('package.json'))"
node -e "JSON.parse(readFileSync('package-lock.json'))"
```

## `npm run check` results

All steps passed, in order, in a single invocation:

- `typecheck` (`tsc -p tsconfig.json --noEmit`) — **passed**, zero errors.
- `lint` (`eslint .`) — **passed**, zero errors/warnings.
- `format:check` (`prettier --check .`) — **passed**.
- `test` (`jest --config jest.config.js`) — **14/14 tests passed**, 2 suites, ~2.4s (previously ~3s under Jest 29 — no slowdown from the upgrade).
- `build` (`tsc -p tsconfig.build.json`) — **succeeded**.

`npm run test:coverage` (run separately, to specifically validate the `babel-plugin-istanbul` override doesn't silently break instrumentation) — **14/14 tests passed** with a full coverage table produced (90.44% statements overall), confirming Istanbul-based coverage collection functions correctly under the overridden dependency.

## Endpoint smoke-test results

Compiled server started temporarily: `NODE_ENV=production PORT=7300 node dist/server.js`.

| Endpoint | Status | Body (abridged) |
|---|---|---|
| `GET /health` | **200** | `{"success":true,"data":{"status":"alive"}, ...}` |
| `GET /ready` | **200** | `{"success":true,"data":{"status":"ready","dependencies":{"database":"NOT_CONFIGURED","redis":"NOT_CONFIGURED","queue":"NOT_CONFIGURED","storage":"NOT_CONFIGURED","auth":"NOT_CONFIGURED"}}, ...}` |
| `GET /api/v1/version` | **200** | `{"success":true,"data":{"service":"furtail-app-api","apiVersion":"v1","applicationVersion":"0.1.0","environment":"production","uptimeSeconds":7}, ...}` |

All three match the exact expected shape from Step 4 — no behavioral regression from the dependency/runtime-policy changes.

## Port cleanup result

Server PID captured via `netstat -ano | grep ":7300" | grep LISTENING`, stopped via `Stop-Process -Force`. Post-stop check confirmed: **no process listening on port 7300.**

## Additional verification

- **No real `.env` file** exists (only `.env.example`) — confirmed via `find`.
- **No alternative package-manager lockfile** (`pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`) exists anywhere in the tree outside `node_modules` — confirmed via recursive `find`. `package-lock.json` remains the sole lockfile, `lockfileVersion: 3`.
- **`furtail_api` git status**: `nothing to commit, working tree clean`.
- **`furtail_app` git status**: `nothing to commit, working tree clean`.
- **`package.json`/`package-lock.json`**: both parse successfully as valid JSON.

## Remaining limitations or accepted risks

1. **This is a "0 known advisories" result today, not a permanent guarantee.** `npm audit`'s advisory database changes over time; a future `npm audit` run against the same lockfile could surface a newly disclosed vulnerability in any of these same packages. This report documents the state as of 2026-07-26T10:12:59Z, not an evergreen claim.
2. **Two `overrides` entries now exist** (`babel-plugin-istanbul@8.0.2`, `brace-expansion@5.0.8`), forcing transitive dependency resolutions that upstream (`@jest/transform@30.4.1`'s own `babel-plugin-istanbul` range, and `minimatch@9.0.9`'s own `brace-expansion` range) haven't yet adopted themselves. If a future Jest release updates `@jest/transform` to depend on `babel-plugin-istanbul@^8.0.0` directly, and/or `glob`/`minimatch` bump their own `brace-expansion` floor past `5.0.7`, these overrides become redundant (harmless to leave, but worth removing at that point to reduce maintenance surface). **Follow-up action:** re-run `npm ls babel-plugin-istanbul` and `npm ls brace-expansion` after any future `jest`/`ts-jest`/`glob` version bump to check whether the override is still load-bearing; remove any override whose forced version now matches what upstream would resolve to unforced.
3. **`allow-scripts` warnings persist** for `esbuild` (already noted in Step 4) and now also `unrs-resolver@1.12.2` (introduced by the ESLint/TypeScript-ESLint dependency graph as part of the Jest 30 reinstall) — both have unreviewed postinstall/install scripts per this environment's script-allowlist gate. Neither blocked installation or any verification step in this report; `npx tsx --version` and the full `npm run check`/coverage/server-smoke-test suite all functioned correctly, indicating the relevant native binaries (esbuild's `win32-x64` build) installed successfully regardless. Not independently deep-audited script-by-script in this step — flagged for awareness, not resolved.
4. **Dev-only classification was verified by dependency-path tracing** (all 21 original advisories rooted in `devDependencies`' subtrees, none reachable from `dependencies` or present in `dist/`), not merely asserted — but this project also has no `dependencies`-side test/build tooling to cross-check against, since the foundation's runtime dependency list (`express`, `dotenv`, `zod`, `cors`, `helmet`, `compression`, `pino`, `pino-http`) is small and was independently confirmed to carry zero advisories both before and after this step's changes.

This result should be described as: **zero currently-known high/critical `npm audit` advisories, achieved through a verified-compatible Jest major upgrade plus two documented, evidence-based `overrides` entries — not as "permanently secure" or "no further action ever needed."**
