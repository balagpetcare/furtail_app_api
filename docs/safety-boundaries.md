# Safety Boundaries

This document defines the hard boundaries that apply while building and
migrating `furtail_app_api`. These boundaries protect the legacy API, the
Flutter application, and all shared infrastructure during migration.

## 1. Read-only legacy API reference

`D:\wpa\furtail\furtail_api` is used strictly as a read-only reference for
architecture, behavior, and contracts. It is never modified, renamed,
moved, or deleted as part of this migration.

## 2. No destructive Prisma commands

No `migrate reset`, `db push --force-reset`, or any other destructive
Prisma operation is run against any database, legacy or new, during this
migration.

## 3. No production database access

No production database connection string is used, and no production
database is queried, migrated, seeded, or altered while `furtail_app_api`
is under construction or verification.

## 4. No secret copying

Secrets, credentials, API keys, and `.env` contents from `furtail_api` or
any other project are never copied into `furtail_app_api`. Only
`.env.example`-style placeholder files are used as needed.

## 5. No automatic production deployment

No deployment of `furtail_app_api` to a production environment occurs as
part of routine construction or migration work without explicit,
separate authorization.

## 6. No Flutter production switch before verification

`furtail_app`'s API configuration is not changed to point at
`furtail_app_api` until the corresponding endpoints have been fully
implemented and independently verified.

## 7. No copying the entire legacy source tree

`furtail_app_api` is not created by copying `furtail_api`'s source,
`node_modules`, Prisma schema, migrations, lockfiles, environment files,
Git history, or build artifacts. Each piece of the new API is built
intentionally, informed by — but not duplicated from — the legacy system.
