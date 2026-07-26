# Step 10 Report: Notification, Reporting, Blocking, and Moderation

## Summary
- Implemented the confirmed Flutter notification and moderation contracts in `furtail_app_api`.
- Kept all changes inside `D:\wpa\furtail\furtail_app_api`.
- Did not modify `furtail_api`, `furtail_app`, or `wpa_auth_api`.
- Real push delivery remains mocked/no-op in tests.

## Workspace Helper
- No workspace-helper failure occurred during this step.
- Native PowerShell access was available throughout the work.

## Diagnostic / Validation Commands
- `npm run check`
- `git -C "D:\wpa\furtail\furtail_app_api" status --short`
- `git -C "D:\wpa\furtail\furtail_api" status --short`
- `git -C "D:\wpa\furtail\furtail_app" status --short`
- `git -C "D:\wpa\wpa_auth\wpa_auth_api" status --short`

## Results
- `npm run check` passed.
- Typecheck passed.
- ESLint passed.
- Prettier check passed.
- Jest passed: 8 suites, 53 tests.
- Build passed.

## Files Created or Modified
- Modified `src/modules/social/social-store.ts`
- Modified `src/routes/social.routes.ts`
- Modified `src/routes/index.ts`
- Created `src/routes/notifications.routes.ts`
- Created `src/routes/reports.routes.ts`
- Created `tests/notifications-moderation.integration.test.ts`
- Created `migration-reports/10-notification-moderation.md`

## Behavior Implemented
- Device token registration with replacement/deduplication.
- In-app notifications list with cursor pagination.
- Unread count, mark-one-read, and mark-all-read.
- Notification settings read/update contract.
- Report reasons and report submission contract.
- Duplicate report deduplication.
- Block and unblock routes.
- Blocking effects enforced across follow, like, friend-request, comment, reply, and post visibility paths.
- Notification delivery adapter with failure isolation and retry handling.
- Moderation-visible `isReportedByMe` on post payloads.

## Exact Packages Changed
- None.

## Tests Added
- Token registration replacement/deduplication.
- Unread counts.
- Mark-read behavior.
- Duplicate reports.
- Blocking effects.
- Authorization.
- Notification deduplication.
- Provider failure.

## Limitations
- Push delivery is mocked/no-op only.
- No production or external service was contacted.
- The target worktree is still structurally untracked in git status, which appears to be the existing repository state.

## Reference Repositories
- `D:\wpa\furtail\furtail_api` remained git-clean.
- `D:\wpa\furtail\furtail_app` remained git-clean.
- `D:\wpa\wpa_auth\wpa_auth_api` remained git-clean.
