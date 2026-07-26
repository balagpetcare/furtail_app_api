# Step 3 — Flutter API Requirements Inventory

Generated: 2026-07-26T09:20:50Z
Method: read-only static analysis of `furtail_app` (Flutter client), cross-referenced against `furtail_api` (legacy backend) route/controller/Prisma-model structure. No servers were run, no network calls were made, no databases were touched. Every claim below is backed by a file:line reference collected during this analysis; anything not directly observed in code is marked UNKNOWN rather than assumed.

## Executive summary

- `furtail_app` talks to **two independent backend services**: the Furtail API (`furtail_api`, port 7200 in dev, `api.furtail.world` in prod) for all app data, and a separate **WPA Central Auth** service (port 5010 in dev) for identity/session management. These are configured via entirely separate config classes (`ApiConfig` vs `CentralAuthConfig`) and are not interchangeable.
- Of ~90 distinct Flutter-invoked Furtail API endpoints identified, the large majority (see `03-endpoint-matrix.csv`) have a matching route in `furtail_api`. A small number of confirmed gaps exist (posts `share`/`view`, standalone comment delete, adoption single-application detail) — see "Confirmed gaps" below.
- **No messaging/chat feature exists** anywhere in the Flutter app or the legacy backend. This is a genuinely absent capability, not a migration gap.
- **No live Socket.IO/WebSocket client exists in `furtail_app`** despite `AppConfig.socketUrl` being wired from env files. `furtail_api` does run Socket.IO, but only for notification push and enterprise clinic/doctor queue features — none of which the Flutter app currently consumes over a socket. Real-time delivery to the Flutter app today is push-notification-based (FCM), not socket-based.
- **Blocking is entirely client-local** (SharedPreferences) in both the current client and legacy backend — not a real backend feature today.
- Two parallel location/master-data systems coexist in both the app and the API (`common/bd/*` legacy BD-specific hierarchy vs `location-master/*` newer generic hierarchy) — a duplication inherited from `furtail_api` that the new API should resolve, not blindly carry forward.
- `furtail_api` itself has an unresolved internal duplication: both a legacy monolithic `prisma/schema.prisma` (164 models, currently authoritative per `prisma.config.ts`) and a newer partially-built multi-file schema (`prisma/schema/*.prisma`) exist side by side. Only the monolithic one is wired in. The new API's Prisma schema should be built fresh, evidence-based from what Flutter actually needs — not copied from either.
- Most of `lib/features/legacy/` (shop, services, vet, donation, dashboard, create/edit post, settings, language, splash, adoption screens under `legacy/`) makes **no backend calls at all** — placeholder/superseded UI, not a source of API requirements, with the single exception of `country_picker_screen.dart` (`GET /public/countries`).
- `lib/core/offline/sync_queue.dart` is **built but not wired** — it queues offline actions locally but has no execution/replay logic (explicit TODO in source). Not a live requirement for the new API today.

## Feature-by-feature findings

See `03-endpoint-matrix.csv` for the full per-endpoint table. Summary by feature:

| Feature | Endpoints found | Status |
|---|---|---|
| Auth (Central Auth) | 18 | CONFIRMED — external service, not part of new API's scope except the `/auth/me` bridge below |
| Auth bridge (Furtail API) | 1 (`GET /auth/me`) | CONFIRMED |
| Profile / current user | ~6 | CONFIRMED, with one path inconsistency (see gaps) |
| Social (follow/like/friend-request/status) | 8 | CONFIRMED |
| Posts / feed / comments / reactions | ~19 | CONFIRMED, 2 confirmed gaps (share, view), 1 partial (standalone comment delete) |
| Feeling activities | 1 | CONFIRMED |
| Pets | 5 | CONFIRMED (base path is `/api/v1/user/pets/*`, matches `furtail_api`'s mount — see note below) |
| Pet medical data | 0 in `features/pets` | UNKNOWN — see "Confirmed gaps" |
| Adoption | ~19 | CONFIRMED, 1 partial (application detail-by-id shape) |
| Fundraising / campaigns | ~15 | CONFIRMED |
| Donations / payment | 4 | CONFIRMED (proxied entirely through backend; no direct payment-gateway SDK calls found) |
| Wallet | 5 | CONFIRMED |
| Notifications | 7 | CONFIRMED, 1 caveat (device-token registration comment suggests it may not be fully live server-side, see below) |
| Reports / moderation | 2 defined, 1 called | 1 CONFIRMED (`POST /reports`), 1 UNKNOWN/dead (`reportReasons` defined, never called, and no matching backend route either) |
| Search | 0 dedicated | CONFIRMED ABSENT — implemented only as query params on posts/adoption listing |
| Messaging / chat | 0 | CONFIRMED ABSENT on both client and backend |
| Settings | mostly local | CONFIRMED, notification-prefs sub-portion hits backend |
| Stories | 4 | CONFIRMED |
| Location / country / state master data | ~12 (split across 2 systems) | CONFIRMED, but duplicated system inherited from legacy — flagged as a design decision for the new API, not a gap |
| Blocking | 0 backend | CONFIRMED ABSENT — local-only today |
| Legacy screens (shop/services/vet/donation/etc.) | 0 | CONFIRMED — placeholder UI, superseded by other features |
| Socket/real-time | 0 client-side | CONFIRMED ABSENT in Flutter; present server-side in `furtail_api` for notifications + enterprise clinic/doctor queues only |

## Authentication flow

Full sequence (see `03-endpoint-matrix.csv` rows tagged `authentication` feature, and `03-module-dependency-map.md` for module boundaries):

1. App start → `AuthController.bootstrap()`: fires Central Auth `GET /auth/bootstrap` (best-effort, non-blocking) and checks `SecureStorageService.hasSession` (local secure-storage read, no network).
2. No session → `unauthenticated`.
3. Session exists → legacy-audience migration check: locally decodes the stored JWT's `aud` claim; if it doesn't match `furtail-mobile`, proactively calls Central Auth `POST /auth/refresh` to obtain a `furtail-mobile`-audience token pair. This is the mechanism handling the temporary `bpa-mobile` legacy audience (see "External service dependencies").
4. `GET {furtail_api}/auth/me` — resolves the Central Auth identity to a local Furtail user (JIT-provisioned if needed). This is the **only** Furtail API involvement in the auth flow; every other auth step talks to Central Auth directly.
5. Login/OTP/social-login/forgot-password/reset-password/session-management all go through Central Auth's `/auth/*` endpoints (18 distinct calls cataloged) — **none of these are Furtail API responsibilities** and are out of scope for `furtail_app_api` to reimplement. `furtail_app_api` only needs the `GET /auth/me`-equivalent bridge.
6. Reactive token refresh on 401 happens transparently in `AuthInterceptor`, single-flighted, calling Central Auth `POST /auth/refresh`; a definitive session failure (`TOKEN_REVOKED`/`REFRESH_TOKEN_EXPIRED`/`CENTRAL_TOKEN_INVALID`) clears local storage and forces logout.
7. Logout: local secure-storage clear + state flip to `unauthenticated` happens synchronously first (guaranteed), then a best-effort Central Auth `POST /auth/logout` call. `resetSessionScopedState()` also unregisters the FCM push token (`DELETE /notifications/device-token` on the Furtail API) and invalidates all session-scoped Riverpod provider caches.

**Implication for `furtail_app_api`**: the new API does not need to implement login/register/OTP/social-login/password-reset/session-listing — those remain Central Auth's job, unchanged, per the confirmed architecture decision to retain the `furtail-mobile` contract initially. The new API's only auth-adjacent surface is the `/auth/me`-equivalent profile-resolution bridge (validate the Central Auth bearer token, JIT-provision/resolve a local user record).

## Media flow

- All media (post/story/pet/profile images and video) is uploaded through a single generic endpoint: `POST /api/v1/media/upload` (multipart, field varies but always produces a media ID referenced by other create/update calls). `ApiEndpoints.uploadPetPhoto()` is explicitly marked deprecated in Flutter source and redirects to this same endpoint.
- Media is served from `MEDIA_BASE_URL` — MinIO directly on port 9000 in dev/emulator/mobile-dev configs, but the *same host as the API* in prod (`https://api.furtail.world`), implying MinIO is proxied through the main API domain in production rather than exposed directly.
- `MediaUrl.normalize()` (client-side) actively rewrites URLs whose host looks like `localhost`/`10.0.2.2`/`*.local`/contains `furtail-storage`/`minio` to the configured `MEDIA_BASE_URL` — this is defensive normalization for dev-environment host mismatches, not a production concern.
- No direct MinIO SDK calls exist client-side; all media I/O is proxied through the Furtail API's `/media/upload` endpoint and whatever URLs that endpoint (or subsequent content responses) return.

## Real-time flow

- **Flutter client**: no Socket.IO/WebSocket client library is used anywhere in `lib/`. `AppConfig.socketUrl` is defined and populated from every env file's `SOCKET_URL` key, but nothing consumes it — dead configuration.
- **`furtail_api` server**: does run Socket.IO (confirmed via `attachSocketIO`/`src/realtime/socketio.gateway.ts`), authenticating via JWT and joining rooms (`user:{userId}`, `org:{orgId}`, `branch:{branchId}`, plus clinic/doctor-queue-specific rooms). Events: `notification:new`, `unread:count`, `QUEUE_UPDATED`, `NOW_SERVING_CHANGED`, `ESTIMATE_UPDATED`, `DOCTOR_QUEUE_UPDATED`. The clinic/doctor-queue events belong to an enterprise/clinic product surface, not the pet-social Flutter app.
- **Conclusion**: today's real-time delivery to `furtail_app` is exclusively via FCM push notifications (`POST/DELETE /notifications/device-token` + notification list/read/unread-count endpoints), not sockets. `furtail_app_api` does not need a Socket.IO server for feature parity with the current Flutter app's actual (not configured-but-unused) behavior. If real-time is desired later, it would be new scope, not a migration requirement.

## External service dependencies

| Dependency | What Flutter/API relies on | Port/host | Migration note |
|---|---|---|---|
| WPA Central Auth (`wpa_auth_api`) | Login, register, OTP, social login, password reset, session management, token issuance/refresh; `furtail_app_api` will also need to validate its bearer tokens | 5010 (dev) | Not modified per Step 3 instructions. `furtail_app_api` retains the `furtail-mobile` client ID/audience contract initially, per confirmed architecture decision. |
| MinIO / object storage | Media storage backing `/media/upload` | 9000 (dev/emulator/mobile-dev); proxied via main API host in prod | New API needs a storage integration decision (reuse existing MinIO instance vs new bucket) — out of scope for Step 3, flagged for Step 4+. |
| Legacy `bpa-mobile` Central Auth audience | Temporary acceptance of pre-migration session tokens issued under BPA's audience, converted via `POST /auth/refresh` to `furtail-mobile` | N/A (JWT claim, not a network endpoint) | `furtail_api`'s `.env.example` documents a cutoff of `2026-08-18T00:00:00Z` after which legacy audience tokens are rejected. `furtail_app_api` inherits the same time-boxed concern if it validates the same tokens. |
| BPA backend (external, not inspected — outside `D:\wpa\furtail`) | Proxies pet requests into `furtail_api` using `bpa-mobile`-audience tokens, per `furtail_api`'s own `.env.example` comment | UNKNOWN | Not verified further — outside the Flutter/legacy-API pair this audit covers. Flagged as UNKNOWN, not confirmed. |
| Payment gateway(s) | No direct SDK calls found client-side; all payment flows are proxied through `furtail_api`'s `/campaign/public/checkout/*` and `/fundraising/campaigns/:id/donate` endpoints | N/A | The actual downstream payment processor(s) `furtail_api` integrates with were not inspected in this step (out of scope — server-internal). |

## Confirmed gaps

Endpoints Flutter actively calls (confirmed live call sites, not just defined-but-unused constants) with **no matching route found** in `furtail_api`, or a route whose path shape differs:

1. **`POST /api/v1/posts/{postId}/share`** — called from `lib/features/posts/presentation/widgets/post_action_sheet.dart:91`. No matching route found in `furtail_api`'s `posts.routes.ts`. CONFIRMED gap.
2. **`POST /api/v1/posts/{postId}/view`** — called from `lib/features/posts/presentation/screens/reels_player_screen.dart:409`. No matching route found in `furtail_api`'s `posts.routes.ts`. CONFIRMED gap.
3. **Standalone `GET`/`DELETE /api/v1/posts/{postId}/comments/{commentId}`** — Flutter's remote datasource defines edit (`PATCH`) and delete (`DELETE`) at this path shape; `furtail_api`'s posts routes only expose nested like/reply sub-routes under `:commentId`, not a plain delete-by-id. PARTIAL — needs controller-level confirmation in a later step, not re-verified byte-for-byte here.
4. **`GET /api/v1/me/adoption-applications/{id}`** (single application detail) — Flutter calls a detail-by-id shape; `furtail_api`'s `/me` router only has `GET /adoptions/:id/applications` (list of applications for a listing) and status/notes update sub-routes, not a single-application detail fetch. PARTIAL — flagged for confirmation, not definitively absent (may exist under a route file not fully enumerated by the reference-mapping agent).
5. **`GET /reports/reasons`** — defined in Flutter's `ApiEndpoints` but **no call site found anywhere in the app** (dead client-side constant), and `furtail_api`'s `reports.routes.ts` has no `/reasons` route either. Not a live gap — both sides agree it's unimplemented/unused. Recorded as UNKNOWN/not-a-gap rather than a migration requirement.
6. **Two parallel profile-path constants**: `ApiEndpoints.myProfile()`/`updateMyProfile()` target `${ApiConfig.userApi}/profile` but the actual live profile calls (`ProfileService`) use hardcoded literals `${ApiConfig.apiV1}/user/me` and `/user/profile` directly, bypassing the `ApiEndpoints` constants entirely. The `ApiEndpoints` versions appear to be dead/unused code, not a second live endpoint. Recorded as an inconsistency to resolve during redesign, not a functional gap (the literal paths do have a matching `furtail_api` route: `/api/v1/user/me` via `profile.routes.ts`).

**Resolved false gaps** (identified during Step 3 verification, not carried forward as gaps): the pet endpoints (`allPets`, `registerPet`, `updatePet`) resolve to `${ApiConfig.userApi}/pets/*` = `/api/v1/user/pets/*`, which **does** match `furtail_api`'s `modules/pets/pets.routes.ts` mount at `/api/v1/user/pets` — an earlier pass mis-rendered this as a `/user-api` mismatch; verified directly against `api_endpoints.dart` and confirmed it is a `/api/v1/user/...` path, correctly matched. Similarly, the friend-request accept/reject/cancel endpoints use `requestId` consistently on both the Flutter and (per the reference mapping) the `furtail_api` side — no path-shape mismatch there.

**Not yet located, needs a dedicated pass**: pet vaccination/medical data. No vaccination/deworming/medical-history endpoints were found called from `lib/features/pets/`. `furtail_api` has `VaccineType`, `Vaccination`, `VaccinationReminder`, `DewormingRecord`, `MedicalHistory` Prisma models and a `campaign`-module vaccination/booking/certificate surface (tied to the vaccination-campaign feature, not routine per-pet medical records). It is UNKNOWN whether the Flutter app has any screen for viewing/editing a pet's own vaccination/medical history outside the campaign-booking flow — this needs a targeted follow-up read of `lib/features/pets/presentation/screens/pet_profile_screen.dart` and related widgets before concluding the capability is unused. Not claimed as either present or absent here.

## Risks

1. **Notification device-token registration may not be a fully live backend contract.** The Flutter call site (`notification_repository.dart:37`) carries an explicit code comment: "Fails silently until backend endpoint ships." Combined with `furtail_api` having a matching route (`POST/DELETE /notifications/device-token`), this is ambiguous — the route exists, but the client code's own comment suggests uncertainty about its production readiness at the time it was written. Flag as PARTIAL confidence, not CONFIRMED, despite the route match.
2. **Duplicated location/master-data systems** (`common/bd/*` vs `location-master/*`) risk being carried forward into the new API without a resolution decision, doubling maintenance for no functional gain.
3. **Two independent, drifting API-base-URL config classes exist client-side** (`ApiConfig` and `AppConfig`) with near-identical logic. Not a backend risk per se, but worth flagging since it affects how confidently "the Flutter app's configured host" can be reasoned about — two sources of truth for the same value.
4. **Financial flows** (fundraising donations, campaign checkout/payment, wallet withdrawals) are the highest-consequence surface for exact-contract compatibility — see `03-module-dependency-map.md` for the explicit list requiring precise field-level compatibility, not just path-level.
5. **BPA legacy-audience cutoff (`2026-08-18T00:00:00Z`)** is a time-boxed external constraint from `furtail_api`'s own env documentation. If `furtail_app_api` also needs to accept legacy-audience tokens during the parallel-migration window, this deadline applies to it too and should be tracked explicitly rather than silently inherited.

## Recommended migration order

Based on usage breadth, coupling, and risk, in ascending order of complexity/risk (build and verify low-risk, high-usage surfaces first; leave financial and identity-adjacent surfaces for last, after the pattern is proven):

1. **Master/reference data** (animal types, breeds, location hierarchy, public countries) — read-only, no auth dependency, low risk, high reuse across other features. Good first module to prove the new API's shape.
2. **Auth bridge** (`GET /auth/me` equivalent) — required by everything else; must exist before any authenticated endpoint can be tested end-to-end, but does not require touching Central Auth itself.
3. **Profile / current user** — foundational for social/posts/pets features that reference user data.
4. **Pets** — moderate complexity, clear boundaries, no payment involvement.
5. **Social (follow/like/friend-request)** — depends on profile being in place.
6. **Posts / feed / comments / reactions / stories** — largest surface area by endpoint count; benefits from the patterns established in steps 1-5.
7. **Notifications** — depends on posts/social existing (notification triggers), and its device-token contract's live-status should be confirmed with the backend team before being treated as CONFIRMED rather than PARTIAL.
8. **Adoption** — self-contained feature domain, moderate complexity, some unresolved path-shape questions (see gaps) to settle before migrating.
9. **Reports / moderation** — small surface, low risk.
10. **Fundraising / donations / campaigns / wallet** — highest financial/security sensitivity; migrate last, after the new API's patterns (auth, error handling, pagination) are proven on lower-risk modules, and require the most rigorous endpoint-by-endpoint verification against `furtail_api`'s existing behavior before cutover.

Messaging/chat and true full-text search are **not included** in this order since neither exists today on either side — they would be net-new scope, not a migration item.
