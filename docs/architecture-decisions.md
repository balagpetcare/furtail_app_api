# Architecture Decisions

This document records the foundational decisions made for `furtail_app_api`
before any application code was written.

## 1. Parallel migration, then eventual replacement

`furtail_app_api` is built and verified while `furtail_api` continues to
serve production traffic. There is no big-bang cutover. The new API
replaces the legacy one only after the migration is complete and verified.

## 2. No direct trimming of the active legacy API

`furtail_api` is not modified, reduced, or refactored as part of this
migration. It is treated as a stable, read-only architectural reference
until the final cutover, after which its retirement is a separate,
explicitly authorized step.

## 3. Port 7300 for the new API

`furtail_api` occupies port 7200. `furtail_app_api` uses port **7300** in
development so both APIs can run simultaneously without conflict.

## 4. npm-only package management

`furtail_app_api` uses npm exclusively. No pnpm, yarn, or bun lockfiles
are introduced. `furtail_api`'s dual-lockfile setup (npm + pnpm) is not
carried over.

## 5. Clean modular implementation

`furtail_app_api` is implemented as a fresh, modular codebase rather than
a copy or fork of `furtail_api`. Legacy code is referenced for behavior
and contract understanding only.

## 6. Minimal, evidence-based Prisma schema

The Prisma schema for `furtail_app_api` is built incrementally, modeling
only what `furtail_app` actually requires, based on observed usage rather
than copying `furtail_api`'s full schema.

## 7. Existing Central Auth `furtail-mobile` contract retained initially

Both `furtail_api` and `furtail_app_api` serve the same Flutter
application during migration, so the existing WPA Central Auth
`furtail-mobile` client ID and audience are retained on the new API at
first. `wpa_auth_api` is not modified as part of this decision.

## 8. No permanent dual writes

Any temporary dual-write or shadow-read pattern used during migration
verification is explicitly transitional and must be removed before final
cutover. Dual writes are not a permanent architecture.

## 9. No production database operations during construction

No production database connection, migration, seed, or reset operation is
performed while `furtail_app_api` is under construction.

## 10. Endpoint-by-endpoint migration

Endpoints are migrated and verified individually rather than all at once,
allowing incremental validation against `furtail_api`'s existing behavior.

## 11. Rollback to `furtail_api` until final cutover

At any point before final cutover, `furtail_app` can continue to rely on
`furtail_api` without disruption. `furtail_app_api` does not become the
authoritative backend until migration is fully verified and cutover is
explicitly performed.
