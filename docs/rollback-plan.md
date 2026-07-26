# Rollback Plan

## Goal

Restore service safely if a migration or compatibility cutover exposes contract mismatches.

## Assumptions

- Legacy tables remain intact.
- Migration tooling is idempotent and checkpointed.
- No permanent dual writes exist.

## Rollback Triggers

Rollback is appropriate if any of the following occur:

- Flutter-visible response fields diverge from confirmed contracts
- auth or authorization failures appear in normal traffic
- reconciliations do not match
- rejected record volume indicates a contract or data quality issue
- destination read paths return incorrect ownership or visibility results

## Rollback Procedure

1. Stop the new API path or route the app back to the known-good legacy-compatible endpoint set.
2. Keep the database online.
3. Do not drop, truncate, or alter legacy tables.
4. Preserve checkpoint and rejected-row artifacts for diagnosis.
5. Compare the compatibility map against the live routes.
6. Re-run dry-run validation against isolated local databases if the issue is structural.

## Read-Only Cutover Procedure

Use read-only cutover when the schema is stable but write confidence is not yet sufficient:

1. Keep source data authoritative.
2. Point reads to the new compatibility surface only when contract parity is verified.
3. Keep write paths disabled or routed through the existing safe implementation.
4. Confirm pagination, ownership, blocking, and moderation behavior.

## Recovery Artifacts

Retain:

- checkpoint file
- rejected-row JSONL
- checksum summary
- compatibility map

These are required to diagnose drift without exposing secrets.

## Do Not

- Do not run production destructive commands.
- Do not use dual writes as a rollback mechanism.
- Do not alter legacy tables as part of recovery.

