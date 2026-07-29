# RUNTIME03 — Flutter profile-loading failure after `GET /api/v1/auth/me` 200

## Exact confirmed root cause

Response-envelope mismatch between the Furtail API and Flutter's profile parser.

- `furtail_app_api/src/routes/auth.routes.ts` (`GET /api/v1/auth/me`) uses `sendSuccess(res, { user }, ...)`.
  `sendSuccess` (`src/core/http/api-response.ts`) always wraps its payload as `{ success, data: <payload>, meta }`,
  so the real wire response is:
  ```json
  { "success": true, "data": { "user": { "id": 42, "name": "...", ... } }, "meta": { "requestId": "...", "correlationId": "..." } }
  ```
  i.e. the user object lives at `data.user`, not at the top level and not directly under `data`.

- `furtail_app/lib/core/auth/auth_controller.dart` `_fetchProfile()` only unwrapped one level:
  ```dart
  if (body['user'] is Map) { userJson = body['user']; }
  else if (body['data'] is Map) { userJson = body['data']; }   // <-- stopped one level too shallow
  else { userJson = body; }
  ```
  Since the real body has no top-level `user` key, it fell into the `body['data']` branch, producing
  `userJson = { "user": { ... } }` instead of the user object itself.

## Exact failing field / state race

`UserModel.fromJson` (`furtail_app/lib/features/auth/data/models/user_model.dart`) requires `json['id']` and
throws `const FormatException("Missing required 'id' field in user profile")` when absent. With `userJson`
one level too shallow, `json['id']` was always `null`, so this threw on every successful `/auth/me` call.

That `FormatException` is not an `ApiClientException`/`DioException`, so it fell into the generic `catch (e)`
in `AuthController._resolveProfileAfterSession()` (and `_saveSessionAndResolveProfile()`), which is exactly
where the reported string comes from:
```dart
FurtailProfileException('Failed to load your profile data from the service. Please try logging in again.')
```
This matches the reported symptom precisely: HTTP 200, but the app shows a generic profile-load failure —
the exception is thrown during JSON parsing inside the success path, not from a network/HTTP error.

This was a pure parsing/contract defect, not a token/session race. No evidence of a token being persisted
after the profile fetch started, and no evidence of a stale request overwriting a newer one, was found in
`AuthController.login()` / `_saveSessionAndResolveProfile()` (tokens are `await`ed and persisted before the
profile fetch is ever called). A dedup guard was still added defensively (see below) since `bootstrap()`,
`login()`, and retry actions can independently call `_fetchProfile()`.

## Files changed

**Furtail App (Flutter)** — `D:\wpa\furtail\furtail_app`
- `lib/core/auth/auth_controller.dart`
  - `_fetchProfile()` now unwraps `data.user` (Furtail API's actual envelope) in addition to the previously
    supported flat `{ user }` (Central Auth's own `/auth/me` shape, used only in that API's own SDK path)
    and a bare `{ data: <user> }` fallback.
  - Renamed the HTTP+parse body to `_fetchProfileUncached()` and added `_fetchProfile()` as a thin
    coalescing wrapper (`_inFlightProfileFetch`) so concurrent bootstrap/login/retry calls share one
    in-flight request instead of racing; a stale request can no longer publish state after a newer one
    has already completed.
- `lib/features/auth/data/models/user_model.dart` — corrected the stale doc comment that described the
  wrong (flat) response shape.
- `test/core/auth/auth_controller_test.dart` — added a regression test asserting the real Furtail API
  envelope (`{ success, data: { user }, meta }`) parses to an authenticated state with the correct profile.

**Furtail API (Node/Express)** — `D:\wpa\furtail\furtail_app_api`
- `tests/app.test.ts` — removed a stale inline assertion (`data.principal.sub`) that predated the
  `getOrProvisionUser` resolution added to `/auth/me`; it no longer matched the route's real contract and
  required a live DB connection this test doesn't provide. Coverage moved to the new contract test below.
- `tests/auth-me-contract.test.ts` (new) — contract test for `GET /api/v1/auth/me`: asserts the exact
  `{ success, data: { user } }` shape Flutter's `_fetchProfile()` unwraps, asserts field-shape stability
  across repeated calls for the same principal (JIT-provision idempotency), and asserts 401 with no token.
  `getOrProvisionUser` is mocked so the test doesn't require a live database.

No change was made to `auth.routes.ts` itself — the envelope it already produces (`{ success, data: { user },
meta }`) is the correct, standard API response envelope (`sendSuccess`) used by every other endpoint in this
API; fixing the client to match it (rather than changing the server to special-case this one route) keeps the
contract consistent across the whole API surface.

## Final `/auth/me` contract

```
GET /api/v1/auth/me
Authorization: Bearer <central-auth-access-token>

200 OK
{
  "success": true,
  "data": {
    "user": {
      "id": <int>,
      "name"?: <string>,
      "email"?: <string>,
      "phone"?: <string>,
      "profile"?: { "displayName"?, "username"?, "avatarUrl"?, "avatarMedia"?: { "url"? } },
      "auth"?: { "email"?, "phone"? }
    }
  },
  "meta": { "requestId": <string>, "correlationId": <string> }
}

401 — no/invalid/expired token (AUTHENTICATION_REQUIRED / CENTRAL_TOKEN_* codes)
```
Flutter's `UserModel.fromJson` requires `id`; all other fields are optional/defensively defaulted.

## Logout

Traced `AuthController.logout()` → `CentralAuthApi.logout()` → Central Auth `POST /auth/logout`
(`wpa_auth_api/src/modules/auth/auth.routes.ts`, gated by `authGuard`).

- Central Auth requires a valid **access token** (`Authorization: Bearer`) — a refresh token is accepted
  only optionally in the JSON body for revocation, not as the auth credential. `CentralAuthApi.logout()`
  already sends the access token exactly this way — no defect found here.
- `AuthController.logout()` already reads the access/refresh tokens, clears local storage and publishes
  `AuthStatus.unauthenticated` **first**, then makes a best-effort remote logout call wrapped in
  `try { ... } catch (_) {}` — any remote 401 (already-expired/revoked session) is swallowed and never
  blocks or reverts local logout. This already satisfies "treat an already-expired/revoked remote session
  as local logout success when safe." No code change was needed for logout; the reported 401 there is
  expected/handled behavior, not a defect, given the local-state-first design.
- No changes made to logout.

## Test results

**Flutter** (`furtail_app`):
- `flutter test test/core/auth/` → **82/82 passed**, including:
  - the new envelope-regression test
  - existing 401-then-success, retry, dedup-adjacent, and logout/navigation tests
- `flutter analyze lib/core/auth lib/features/auth lib/services/api_client.dart` → 0 errors (9 pre-existing
  lint infos in unrelated files, unchanged by this fix)
- Full `flutter test` run: 11 failures remain, all in unrelated pre-existing/WIP areas (fundraising error
  mapper, location selector widget, `test/core/config/cutover_*` — an untracked WIP test directory already
  present before this session). None touch auth/profile code.

**API** (`furtail_app_api`):
- `npm run typecheck` → clean
- `npm run lint` → clean (after fixing a `no-require-imports` violation in the new contract test)
- `npm run test` → **10 suites / 59 tests passed**, including the fixed `app.test.ts` and the new
  `auth-me-contract.test.ts` (3 tests: envelope shape, repeated-call field-shape stability, 401 without token)
- `npm run format:check` → fails, but only on files this session never touched (`.local-backups/*`,
  `prisma/seeds/*`, `src/modules/auth/auth.service.ts`, `src/routes/auth.routes.ts`,
  `src/security/jwt-verifier.ts`) — these are pre-existing uncommitted modifications already present in the
  working tree before this investigation began (confirmed via `git diff --stat`, unrelated to this fix).

## Emulator / live-run results

**Not performed.** This session had no attached Android/iOS emulator or simulator, and no running instance
of Central Auth (port 5010) or the Furtail App API (port 7300) was started, so step-by-step items 4–7 under
"Verification" in the task (clear app data, real login, watch live traffic, confirm home screen/retry/logout/
second-login/no-duplicate-JIT) were **not** exercised against a live stack. The fix is verified at the unit/
contract-test level only: the exact JSON shape the real API endpoint produces (per `sendSuccess`, unchanged)
now round-trips correctly through `UserModel.fromJson`, proven by both the Flutter regression test and the
API contract test asserting the same envelope from the other end.

## Remaining limitations

- No manual emulator verification was performed (see above) — this should be done before considering the
  fix fully closed per the task's own verification checklist.
- The observed "first two `/auth/me` calls returned 401, then two 200s" behavior was not root-caused in this
  session. `AuthInterceptor._shouldAttemptRefresh()` only retries on `code == 'CENTRAL_TOKEN_EXPIRED'`; if the
  transient 401s carried a different code (e.g. `CENTRAL_TOKEN_INVALID` from clock skew or JWKS-cache warming
  on Central Auth's side, as previously documented in `AUTH01-login-profile-401-fix.md`), they would not have
  triggered a refresh-and-retry and their eventual resolution to 200 is unexplained by anything changed here.
  Recommend capturing the `code` field of those specific 401 bodies on the next reproduction.
- `npm run format:check` is red on this branch for files unrelated to this fix; recommend a separate
  formatting pass before merge, independent of this change.

---

NEXT COMMAND TO RUN:
Retest the remaining Flutter modules only after authenticated home navigation succeeds.
