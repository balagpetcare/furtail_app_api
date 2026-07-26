# Migration Runbook

## Purpose

This runbook covers controlled, repeatable migration of legacy-compatible data into `furtail_app_api` without touching production automatically.

## Scope

The migration tooling in `scripts/migration` is limited to legacy data that still matters for confirmed Flutter contracts:

- notification preferences
- device tokens
- notifications
- notification reads
- reports

No permanent dual-write behavior is introduced.

## Required Inputs

The migration CLI requires both URLs explicitly:

- `--source-url`
- `--destination-url`

Environment fallbacks are supported for local execution only:

- `SOURCE_DATABASE_URL`
- `DESTINATION_DATABASE_URL`

Credentials are redacted from logs and reports.

## Recommended Dry Run

Run a dry run before any real migration:

```bash
node scripts/migration/cli.js \
  --source-url "postgres://source" \
  --destination-url "postgres://destination" \
  --dry-run \
  --reconcile \
  --batch-size 500 \
  --checkpoint .tmp/migration-checkpoint.json \
  --rejected .tmp/migration-rejected.jsonl
```

Dry-run behavior:

- reads from the source database
- computes batch and job checksums
- writes checkpoint progress
- emits rejected rows to JSONL
- performs reconciliation
- does not write destination rows

## Resume Procedure

If the process is interrupted:

1. Re-run with the same checkpoint path.
2. Keep the same source and destination URLs.
3. Use the same manifest version.
4. Continue with the same batch size if you need deterministic replay.

The tool is idempotent at the row level through key-based upserts and checkpoint progress.

## Cancellation

Cancellation is supported by either:

- abort signal
- presence of a cancel file path

Cancellation writes the current checkpoint before exit.

## Verification

Validate:

- source row counts
- destination row counts
- job checksums
- reconciliation match status
- rejected row output

## Cutover Readiness

Before read-only cutover:

- confirm dry-run reconciliation matches
- review rejected records
- confirm destination row checksums
- confirm the app still resolves confirmed Flutter contracts
- keep legacy tables untouched

## Operational Notes

- Do not run against production unless explicitly approved outside this tooling.
- Do not mutate legacy tables.
- Do not enable permanent dual writes.
- Do not store credentials in logs, reports, or rejected-row output.

