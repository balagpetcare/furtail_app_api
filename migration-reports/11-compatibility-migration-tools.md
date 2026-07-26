# Step 11 Compatibility and Migration Tools

## Summary

Step 11 added controlled legacy migration tooling and the documentation needed to support rollback-safe compatibility work.

## Compatibility Result

The confirmed Flutter contracts already resolve against the current API surface for the endpoints reviewed in Step 11, so no new runtime compatibility shims were required.

## Files Created or Modified

- `scripts/migration/legacy-data.manifest.json`
- `scripts/migration/legacy-migration.js`
- `scripts/migration/legacy-migration.d.ts`
- `scripts/migration/cli.js`
- `tests/migration-dry-run.test.ts`
- `eslint.config.js`
- `tsconfig.json`
- `docs/migration-runbook.md`
- `docs/rollback-plan.md`
- `docs/endpoint-compatibility-map.md`
- `migration-reports/11-compatibility-migration-tools.md`

## Migration Tooling

Implemented under `scripts/migration`:

- dry-run support
- configurable batch size
- checkpoint and resume
- idempotent reruns
- transaction boundaries in the destination adapter
- counts and checksums
- rejected-record JSONL output with redaction
- reconciliation mode
- cancellation via abort signal or cancel file
- explicit source and destination database URL validation
- URL redaction in CLI output

## Test Coverage

Added isolated migration tests for:

- dry-run and checkpoint behavior
- reconciliation
- rejected-row redaction
- resumable reruns
- cancellation before destination mutation

## Commands Executed

- `npx prettier --write scripts/migration/legacy-data.manifest.json scripts/migration/legacy-migration.d.ts scripts/migration/legacy-migration.js tests/migration-dry-run.test.ts`
- `npm run check`
- `npx jest tests/migration-dry-run.test.ts --runInBand`
- `git status --short`
- `git -C "D:\wpa\furtail\furtail_api" status --short`
- `git -C "D:\wpa\furtail\furtail_app" status --short`
- `git -C "D:\wpa\wpa_auth\wpa_auth_api" status --short`

## Results

- `npm run check` passed.
- Migration dry-run tests passed.
- No production database or external service was touched.
- The read-only reference repositories remained git-clean.

## Rollback and Cutover Notes

- Legacy tables were not altered or dropped.
- No permanent dual writes were introduced.
- Cutover remains read-only until Step 12 introduces the Flutter-side switch behind rollback-safe configuration.

## Unresolved Limitations

- The migration tooling is intentionally limited to the legacy data classes confirmed in Step 11.
- Compatibility routes were not changed because the reviewed Flutter contracts already matched the current implementation.

