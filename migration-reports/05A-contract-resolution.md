# Step 5A — Contract Resolution

Generated: 2026-07-26T10:31:12Z

Method: read-only static analysis of `furtail_app`, `furtail_api`, and `wpa_auth_api`, cross-referencing Flutter call sites against legacy route registrations, controllers, services, validators, and Prisma schema field lists. No server was run, no database was queried, no dependency was installed. Every claim below cites a specific file:line/symbol; anything not directly confirmed is marked UNKNOWN rather than assumed.

All 21 PARTIAL/UNKNOWN rows from `03-endpoint-matrix.csv` are addressed below, one subsection each, grouped by domain. See `05A-endpoint-matrix-resolved.csv` for the machine-readable outcome (aggregate rows split into individual endpoints where the underlying evidence showed multiple distinct HTTP calls).

**Honesty note on "CONFIRMED" status**: every item below reached CONFIRMED confidence at the *HTTP contract level* (path, method, existence, and general shape are now evidence-based, not guessed). Several items still carry a smaller, explicitly flagged residual UNKNOWN at a *deeper* level (e.g. whether a service applies additional validation beyond what the controller shows, or whether a field is used by code outside the files read). These are called out per-item under "Remaining uncertainty" — CONFIRMED here means "the contract is now evidence-based," not "every possible question about this endpoint has been answered."

---

## 1–2. Profile visitor lookups: `GET /user/{userId}`, `GET /user/by-username/{username}`

**Evidence**: `furtail_app/lib/services/social_service.dart:34-44`; `furtail_api/src/api/v1/modules/profile/profile.routes.ts:15,18`.

**Final HTTP contract**: Both routes require the standard `auth` (JWT) middleware — despite being framed as "visitor" profile lookups in the Flutter naming, neither is public. An unauthenticated caller receives a 401 before the visitor's profile is ever resolved.

**Ownership**: `NEW_API_OWNS` (`UserProfile`).

**Remaining uncertainty**: none material — this was a straightforward auth-requirement confirmation.

**Risk**: LOW. Migration note: if the new API intends visitor profiles to be publicly viewable (a common social-app pattern), that would be a deliberate *behavior change* from the legacy contract, not a bug fix — flag for a product decision, not silently changed.

---

## 3. `GET /posts/user/{userId}/videos`

**Evidence**: `furtail_app/lib/core/network/api_endpoints.dart:87-88` (defined); grep of `lib/` for `postsUserVideos` found no other reference. `furtail_api/src/api/v1/modules/posts/posts.routes.ts:18` (`GET /user/:userId/videos`, `auth`).

**Final HTTP contract**: Legacy route exists and is reachable; the Flutter client defines the constant but never calls it from any screen/provider.

**Ownership**: `NEW_API_OWNS`.

**Remaining uncertainty**: none.

**Risk**: LOW. Not a migration gap — reclassified `LEGACY_UNUSED` (from the client's perspective). Whether the new API should still implement it is a product scoping question (a future screen might use it), not a correctness question.

---

## 4–5. Standalone comment `PATCH`/`DELETE /posts/{postId}/comments/{commentId}`

**Evidence**: Full read of `furtail_api/src/api/v1/modules/posts/posts.routes.ts:42-48` — the entire `/comments` sub-route table: `GET` (list), `POST` (add), `POST .../like`, `DELETE .../like`, `POST .../replies`. No standalone edit-by-id or delete-by-id route exists.

**Final HTTP contract**: **Definitive NOT_FOUND.** This is a genuine backend gap, not a partial-evidence situation — the route table was read in full and the routes are simply absent.

**Ownership**: `NEW_API_OWNS` (would need to be built new; no legacy operation to port).

**Remaining uncertainty**: whether the Flutter `PATCH`/`DELETE` methods in `posts_remote_ds.dart` are actually invoked from a live comment-edit/delete UI (i.e. does a user-facing "edit comment"/"delete comment" button exist and silently fail today against `furtail_api`) was not re-traced to a specific screen in this step — worth a follow-up grep for the calling widget before deciding this is safe to simply drop from the new API's scope.

**Risk**: MEDIUM — if the UI path is live, users hitting "delete comment" today get an error from `furtail_api` (a pre-existing legacy bug, not something introduced by migration); the new API should decide whether to finally implement this or the UI needs to stop offering it.

---

## 6. Pet medical / vaccination / weight / deworming / documents / profile image (single UNKNOWN row)

**Evidence**: Full file listing of `lib/features/pets/`; full read of `pet_profile_screen.dart` and `pet_service.dart`; full route table of `furtail_api/src/api/v1/modules/pets/pets.routes.ts:5-43`; Prisma field lists for `Vaccination`, `VaccinationReminder`, `DewormingRecord`, `MedicalHistory`, `PetWeight`, `PetDocument`, `VaccineType` (`prisma/schema.prisma:1227-1434`).

**Final contract, split into 5 sub-domains** (see resolved CSV for individual rows):

| Sub-domain | Flutter call site | Legacy route family | Verdict |
|---|---|---|---|
| Vaccination records | None (only `healthStatus.vaccinated`/`nextDueDate` inside the aggregate `GET .../profile` read) | `pets.routes.ts` full CRUD incl. clinical fields, certificate token, campaign-booking linkage | Legacy-only |
| Weight tracking history | None (only single latest `weightKg` inside `/profile`) | Full CRUD | Legacy-only |
| Deworming records | None at all | Full CRUD | Legacy-only |
| Medical history | None — the "Medical History" button (`pet_profile_screen.dart:136`) is a hardcoded `SnackBar` stub, no network call | Full CRUD | Legacy-only |
| Pet documents | None | Full CRUD (category, mediaId, title, documentDate, notes) | Legacy-only |

**Ownership**: `LEGACY_API_TEMPORARILY_OWNS` for all five — the data model and capability exist only in `furtail_api` today; nothing in the Flutter app reads or writes any of it beyond the coarse aggregate snapshot on the pet-profile screen.

**Campaign-vaccination cross-check**: the vaccination-campaign booking flow (`campaign_repository.dart:272-280`, `fetchVaccinations()`) is a **separate, read-only, campaign-scoped** data path with no code connection to `pet_profile_screen.dart` — confirmed via grep (no shared model, no cross-import). The legacy `Vaccination` Prisma model *does* have a `campaignBookingId` relation, meaning campaign-booked vaccinations are technically stored per-pet in the same table the per-pet route would read — but since Flutter never calls that per-pet route, this backend-side linkage is currently invisible to the app.

**Remaining uncertainty**: none regarding the contract itself — the absence of a Flutter call site is thoroughly confirmed (file-by-file read, not a grep miss). What remains genuinely open is a *product* question, not an evidence question: should the new API expose full per-pet medical/vaccination/weight/deworming/document CRUD (matching legacy's capability) even though no current screen uses it, on the assumption a future screen will? See `05A-prisma-input-catalog.md` for a recommendation.

**Security/migration risk**: MEDIUM. This is real clinical/health data with a rich legacy model (administering org/branch, batch numbers, certificate tokens). If the new API is scoped to exactly "what Flutter currently calls," this entire domain is out of scope — but that would be a conscious product decision to make, not something to silently drop.

---

## 7. `GET /me/adoption-applications/{applicationId}`

**Evidence**: Full read of `furtail_api/src/api/v1/modules/adoptions/adoptions.routes.ts:24-29`.

**Final HTTP contract**: **Definitive FOUND.** `meRouter.get("/adoption-applications/:applicationId", auth, controller.getApplicationDetail)` — distinct from the list route, the sub-application-list route (`/adoptions/:id/applications`), and the status/notes update routes. The original PARTIAL was caused by an earlier pass not reading the full route table.

**Ownership**: `NEW_API_OWNS`.

**Remaining uncertainty**: none.

**Risk**: LOW.

---

## 8. `GET /fundraising/feed`

**Evidence**: `furtail_app/lib/features/fundraising/data/repositories/fundraising_repository.dart:176-215`; `furtail_api/src/api/v1/modules/fundraising/fundraising.routes.ts:31`; `fundraising.controller.ts:189-210`; `fundraising.service.ts:679-719,740-889`; `fundraising.dto.ts:87-97`.

**Final HTTP contract**:
- Query: `limit` (1–100, default 20), `cursor` (opaque, server-encoded composite of `createdAt`+`id`), `sort` (`NEW`|`TOP_DONATED`|`ENDING_SOON`, default `NEW`), `category`, `location`, `bdDivisionId`/`bdDistrictId`/`bdUpazilaId`/`bdAreaId`.
- **Flutter sends an extra `verified` boolean param that the server schema does not define** — zod's non-strict parsing silently drops it. This has zero effect server-side; not a bug exactly, but dead client-side filtering intent.
- Response: `{ items: [...], nextCursor }`, each item shaped via `toFeedDto` — notably **no raw `targetAmount` Int is ever returned**, only `*Minor` fields as strings (`targetAmountMinor`, `monthlyGoalMinor`, `raisedAmountMinor`), even though the underlying Prisma `select` does pull `targetAmount`.
- Auth: `optionalAuth` — works unauthenticated; when authenticated, adds a `viewerHasDonated` boolean per item and bypasses a public response cache.

**Ownership**: `NEW_API_OWNS` (`FundraisingCampaign` + nested `post`/`stats`).

**Remaining uncertainty**: the exact filter semantics inside `buildPublicWhere(countryCode)` (country-scoping logic) were not read line-by-line.

**Risk**: LOW.

---

## 9. `GET /fundraising/my/campaigns`

**Evidence**: `fundraising_repository.dart:218-225`; `fundraising.controller.ts:1077-1098`; `fundraising.service.ts:894+`.

**Final HTTP contract**: Route is registered literally as `/my/campaigns` — matches Flutter exactly (the earlier PARTIAL flagged a possible `/my-campaigns` mismatch; this is now definitively ruled out). **The controller never forwards `req.query.limit` to the service** — Flutter's `?limit=100` has zero server-side effect; the service always applies its own internal default (100, capped at 200). Response is a **plain array**, not a cursor-paginated envelope, matching what Flutter's `_asObjectList` expects (no cursor is read client-side either — consistent, not a bug). Account lookup (`prisma.fundraisingAccount.findFirst`) returns an empty list gracefully if the user has no fundraising account yet — no error thrown.

**Ownership**: `NEW_API_OWNS` (`FundraisingAccount` lookup + `FundraisingCampaign` query).

**Remaining uncertainty**: none.

**Risk**: LOW — the ignored `limit` param is a minor legacy inconsistency worth fixing (not perpetuating) in the new API, not a migration blocker.

---

## 10. Fundraising campaign CRUD (aggregate → 8 endpoints)

**Evidence**: `fundraising_repository.dart` (multiple line ranges, see resolved CSV); full route table `fundraising.routes.ts:32-41`; validators `fundraising.dto.ts:108-126` (`fundraisingCompatCreateSchema`) and `:128-143` (`fundraisingCompatUpdateSchema`).

**Final HTTP contract** — split into: `GET /campaigns/{id}`, `POST /campaigns/drafts`, `GET /campaigns/{id}/draft`, `PATCH /campaigns/{id}/draft`, `POST /campaigns/{id}/submit`, `POST /campaigns`, `PATCH /campaigns/{id}`, `DELETE /campaigns/{id}`. The create/update validators (`fundraisingCompatCreateSchema`/`fundraisingCompatUpdateSchema`) match Flutter's payload fields **field-for-field** — confirmed by direct comparison, not assumed. Notably, `campaignDraftBodyBase` requires `beneficiaryType`/`beneficiaryName` but the *compat* schemas Flutter actually hits do not pick those fields up as required — consistent with Flutter never sending them.

**Ownership**: `NEW_API_OWNS`. `FundraisingCampaignStatusHistory` is written server-side on status transitions (audit trail), never client-supplied directly.

**Remaining uncertainty**: the `/campaigns/:id/publish` (admin-only, `requireAdminAuth`+`admin2fa`) and `/campaigns/:id/single` routes exist server-side but are correctly never called by the Flutter app (admin-console-only and unused respectively) — not a gap, noted for completeness.

**Risk**: MEDIUM (campaign lifecycle correctness matters for a financial-adjacent feature, though the CRUD operations themselves aren't the money-movement step).

---

## 11. Campaign updates CRUD (aggregate → 4 endpoints)

**Evidence**: `fundraising_repository.dart:385-452`; `fundraising.routes.ts:58-61`.

**Final HTTP contract** — split into: `GET /campaigns/{id}/updates` (cursor-paginated, `limit`+`cursor`), `POST /campaigns/{id}/updates` (`caption?`, `mediaIds=[]`), `PATCH /updates/{updateId}`, `DELETE /updates/{updateId}`.

**Ownership**: `NEW_API_OWNS`, but with a structural note: `FundraisingUpdate` (Prisma) is a thin `campaignId`↔`postId` join row — the actual update *content* (caption, media) lives on the linked `Post` record, not on `FundraisingUpdate` itself.

**Remaining uncertainty**: unlike campaign CRUD, this route group has **no `requireFeature('FUNDRAISING')` gate** — only plain `auth` + a mutation rate limiter. Whether this is intentional (updates are considered lower-privilege than campaign creation) or an oversight in the legacy system was not determinable from the code alone.

**Risk**: MEDIUM.

---

## 12. Fundraising account verification (aggregate → 5 endpoints)

**Evidence**: `fundraising_repository.dart:454-570`; `fundraising.routes.ts:68-74`; controller functions `getMyAccount`/`updateMyAccount`/`addVerificationDocument`/`deleteVerificationDocument`/`submitAccount`.

**Final HTTP contract** — split into: `GET /account/me`, `PATCH /account`, `POST /account/submit`, `POST /account/documents`, `DELETE /account/documents/{id}`.

**Critical finding**: document "upload" is **not** a multipart endpoint — `addDocument({title, mediaId})` only ever sends a `title` and an already-obtained `mediaId` integer. The actual binary upload must happen through a separate, generic media-upload call elsewhere in the app (not located within `fundraising_repository.dart` itself — the exact call site is UNKNOWN from this file alone, though the app-wide generic `POST /media/upload` endpoint, confirmed elsewhere in Step 3, is the near-certain candidate).

**Ownership**: `NEW_API_OWNS` (`FundraisingAccount`, `FundraisingVerificationDocument`). `FundraisingAccountStatusLog` is admin-only (written by a separate admin route, not user-facing).

**Remaining uncertainty**: `updateMyAccount`'s controller forwards a large explicit field whitelist from `req.body` with **no zod validator visible at the call site itself** — UNKNOWN whether the service layer applies further validation beyond the controller's whitelist (the service function body was not read in this step). This is a genuinely open question, not resolved to CONFIRMED at that specific depth — flagged explicitly rather than assumed safe.

**Risk**: MEDIUM (identity/KYC-adjacent fields — national ID, birth registration number, passport number — flow through this endpoint; validation gaps here have real consequences even though this isn't a money-movement endpoint itself).

---

## 13. Donations & payment lifecycle (context for the already-CONFIRMED `donate` row — deepened per task requirement #6)

This row was already CONFIRMED in Step 3, but the task explicitly requires the full financial contract to be itemized, so it's captured here in full.

**Evidence**: `fundraising_repository.dart:279-317`; `fundraising.controller.ts:549-639`; `fundraising.payment.service.ts:412-1264+`; `prisma/schema.prisma` (`FundraisingDonationIntent:1818-1822`, `FundraisingDonationPaymentAttempt:1848-1850`, `Donation:1783-1788`, `FundraisingPaymentWebhook:1864-1880+`, `FundraisingCampaignIdempotencyKey:1753-1765`).

**Accepted amount format**: client sends `amount` as an **`int`** (Flutter param name `amountMinor`, sent as body field `amount`) — server-side, `parseMinorUnits(input.amount)` converts this into a **`BigInt`** representing minor currency units (validated `>0n` and `<= MAX_PERSISTED_MINOR_UNITS`). The finalized `Donation.amount` Prisma field, however, is typed plain **`Int`**, not `BigInt` — **UNKNOWN whether `Donation.amount` and the intent/attempt `*.amountMinor BigInt` fields share the same unit scale**; this was not traced into the finalize/settle code path in this step and is flagged as an open question, not resolved.

**Currency representation**: `currencyCode` string field (e.g. `"BDT"`), normalized server-side via `normalizeCurrencyCode()`.

**Minor-unit/Decimal behavior**: minor-unit integer representation (BigInt) at the intent/attempt stage — **no `Decimal` Prisma type is used anywhere in this donation path** (confirmed by field-type inspection).

**Idempotency keys**: client-optional — sent as an HTTP **header** (`Idempotency-Key`/`idempotency-key`, case-insensitive read server-side), not a body field. If present, the server looks up `FundraisingDonationIntent.idempotencyKey` (a unique column) and, if a match exists, returns the existing intent+attempt with `reused: true` **without creating a new payment**. `FundraisingCampaignIdempotencyKey` (a separate, more generic table) exists but is **not used by this specific donation path** — it appears to serve a different call site (likely `submitDraft`, which does send its own `idempotencyKey`, per `fundraising_repository.dart:267-277`), UNKNOWN exact usage confirmed.

**Payment initiation response**: `{ donationIntent, payment, reused: boolean }`.

**Callback/webhook fields**: **No dedicated fundraising-specific webhook route was located** in `fundraising.routes.ts`. The webhook-processing pipeline itself (`persistWebhook`, `markWebhookFailure`, dedup via `FundraisingPaymentWebhook.eventKey`/`providerTxKey` unique constraints, `processingStatus` state check) lives in `fundraising.payment.service.ts`, but the HTTP entrypoint that invokes it was not found under `/fundraising/*` — it likely lives in a shared `/payments/*` module (a different `campaign.routes.ts:609-642` webhook was confirmed to exist for the *campaign* checkout domain, a distinct feature). **This is a genuine remaining UNKNOWN**, not resolved in this step: the exact webhook route path for fundraising donations specifically was not located.

**Status transitions**: `FundraisingDonationIntentStatus` (default `PENDING`) and `FundraisingDonationPaymentStatus` (default `PENDING`) enums exist; **their full value lists were not read** from the Prisma enum declarations in this step (schema.prisma enum blocks not opened) — UNKNOWN. `Donation.status` uses `TransactionStatus` (default `PENDING`) — also UNKNOWN full value list.

**Duplicate-processing prevention**: two independent mechanisms — (a) client-idempotency-key dedup at intent-creation time (`FundraisingDonationIntent.idempotencyKey` unique constraint), and (b) webhook-level dedup via `FundraisingPaymentWebhook.eventKey`/`providerTxKey` unique constraints plus an explicit `processingStatus === "PROCESSED"` short-circuit check before reprocessing.

**BigInt/Decimal serialization boundary**: `amountMinor` fields are Prisma `BigInt` — this is exactly the case the new API's `safeJsonStringify` (built in Step 4) must handle correctly when these values eventually flow through response envelopes; confirmed relevant, not hypothetical.

**Risk**: **HIGH.** This is the single highest-stakes contract in the entire inventory. The `Donation.amount Int` vs `*.amountMinor BigInt` unit-scale question and the missing webhook-route location are both explicitly unresolved and must be answered — not assumed — before the new API implements any donation-processing code.

---

## 14. `POST /campaign/public/coupons/validate`

**Evidence**: grep of the entire `lib/features/campaign` tree for `couponValidate`/`CouponValidate` — zero call sites beyond the `ApiEndpoints` constant definition. `campaign.routes.ts:510-524`.

**Final HTTP contract**: **Dead code client-side.** The endpoint is defined in `ApiEndpoints` but never invoked. Coupon codes are instead passed inline as a `couponCode` field inside `initCheckout()`'s request body — the dedicated validate-only endpoint is bypassed entirely by the app's actual flow. Server-side, the route is public (no auth), and `validateCampaignCoupon(code)` appears to be a synchronous code-format check (not visibly Prisma-backed, based on the code read), returning 400 `INVALID_COUPON` on failure.

**Ownership**: `NEW_API_OWNS`.

**Remaining uncertainty**: whether `validateCampaignCoupon` internally does a database lookup (e.g. checking an actual coupon table for existence/expiry) versus a pure format/checksum validation was not conclusively determined — the synchronous-looking call signature suggests format-only, but this wasn't verified against the coupon's own service implementation.

**Risk**: LOW.

---

## 15. `/campaign/booking/*` (create, my, :ref, :ref/cancel, :ref/payment, :ref/payment-status)

**Evidence**: full read of `campaign.routes.ts:693-756` (the `bookingRouter`); grep of the entire `lib/features/campaign` tree for calls to this sub-router — none found.

**Final HTTP contract**: None of these six routes are called by `campaign_repository.dart`. The Flutter app's actual booking-creation flow goes through the entirely separate `checkout/init`+`confirm-free` public flow instead, and post-booking data (my bookings, vaccinations, upcoming, benefits) goes through `/campaign-link/*`. The booking sub-router uses a **distinct authentication model** — OTP-session Bearer tokens (`requireOtpSession`/`verifySession`), not the standard Furtail JWT — and additionally scopes `/:ref/payment` by matching the booking owner's phone against the session's phone.

**Ownership**: `LEGACY_API_TEMPORARILY_OWNS`.

**Remaining uncertainty**: whether any *other* Flutter repository file (outside `campaign_repository.dart`, which is the only file inspected in this step for this domain) calls this sub-router was not checked — this is a real, stated limitation, not an oversight glossed over.

**Risk**: MEDIUM. If this sub-router is genuinely unused by the entire app, it's a strong `LEGACY_UNUSED` candidate for the exclusion list; if some other screen does call it, the OTP-session auth model is a meaningfully different contract shape the new API would need to reproduce, not just another JWT-protected route.

---

## 16. Campaign certificate / verify (aggregate → 6 endpoints)

**Evidence**: full read of `campaign_repository.dart:317-355`; full read of `campaign.routes.ts` (public certificate block) and `campaignLink.routes.ts` (`router.use(auth)` at line 23).

**Final HTTP contract** — split into 6 distinct routes: 3 public (`GET /campaign/public/verify/{token}`, `GET /campaign/public/certificates/{token}`, `GET /campaign/public/certificates/{token}/pdf`) and 3 authenticated (`GET /campaign-link/certificates/{token}`, `GET /campaign-link/certificates/{token}/pdf`, `POST /campaign-link/certificate/{token}/claim`). The public and campaign-link `certificates`/`certificates/pdf` routes call the **same underlying functions** (`getCertificateData`, `generateCertificatePdf`) — genuinely duplicated implementations across two route files, not accidentally similar. `verifyCertificatePublic` (Flutter) calls the public `/verify/:token` variant specifically; `fetchCertificate`/`fetchCertificatePdf`/`claimCertificate` call the campaign-link (authenticated) variants — confirmed as two intentionally distinct usage paths (anonymous verification vs. authenticated claim/view), not redundant.

**Ownership**: `NEW_API_OWNS`.

**Remaining uncertainty**: the certificate-generation/PDF-rendering logic itself was not traced (server-internal, not read).

**Risk**: MEDIUM. The duplicated public/authenticated implementation is a genuine consolidation opportunity flagged for the new API's design, not something to blindly replicate as two copies.

---

## 17–18. Notification device-token `POST`/`DELETE /notifications/device-token`

**Evidence**: `notification_repository.dart:38-71`; call-site trace via `notification_service.dart:223,227` and `notification_controller.dart:235-246`; `notifications.routes.ts:6-7`; `notifications.controller.ts:60-99`; `UserDeviceToken` (`schema.prisma:865-880`); `pushNotification.service.ts:26-145`.

**Final HTTP contract**: `POST` upserts `UserDeviceToken` keyed on the unique `token` column (`userId, platform, deviceId, isActive:true, lastSeenAt`); `DELETE` reads `token` or `deviceId` from body/query and sets `isActive:false` via `updateMany`. Both routes require `auth`.

**Critical correction to the original PARTIAL flag**: the client-side comment "Fails silently until backend endpoint ships" is **now known to be stale**. Registration **is** exercised in the live app flow — but not via the code path its own doc comment implies. `registerPushAfterAuth()` (the function whose comment says "call after successful login") has **zero callers anywhere in `lib/`** — genuinely dead. Registration instead fires from `notification_service.dart`'s Firebase-messaging initialization (`_initFirebaseMessaging()`, on both initial token fetch and `onTokenRefresh`), which *is* exercised live. The backend endpoint is real, functioning, and backed by a genuine Prisma model — this was previously a documentation-vs-reality mismatch, not a backend-readiness question.

**Ownership**: `NEW_API_OWNS` (`UserDeviceToken`).

**Push pipeline confirmed non-stub**: `pushNotification.service.ts:104-145` reads active `UserDeviceToken` rows for a recipient and calls `admin.messaging().sendEachForMulticast()`, deactivating tokens on invalid-token errors from Firebase. This is real, wired infrastructure, not a placeholder.

**Remaining uncertainty**: Firebase credential environment variable names (`FIREBASE_SERVICE_ACCOUNT_JSON` / `FIREBASE_PROJECT_ID`+`FIREBASE_CLIENT_EMAIL`+`FIREBASE_PRIVATE_KEY` / `GOOGLE_APPLICATION_CREDENTIALS`) do **not** appear anywhere in `furtail_api/.env.example` — undocumented in the template. Whether the actual production `.env` has real Firebase credentials configured is **genuinely UNKNOWN** — not inspected (no `.env` file was read, per the safety rules; only the template was checked, and it doesn't even mention these variable names). If unconfigured, `getFirebaseAdmin()` returns `null` and push silently no-ops (`{sent:0, failed:0, skipped:true}`) rather than erroring — a graceful-degradation design, but it means "the endpoint works" does not by itself prove "push notifications are actually being delivered in production."

**Risk**: MEDIUM. No test file exists for this route (`notificationQueue.test.ts` and `warehouseOpsNotifications.service.test.ts` were the only notification-adjacent tests found; neither targets `/device-token`).

---

## 19. `POST /stories`

**Evidence**: `story_remote_ds.dart:38-53`; `stories.routes.ts:7-22`.

**Final HTTP contract**: Direct multipart upload (field name `media`), not a mediaId-reference pattern (unlike fundraising documents, Group C above) — confirmed by reading the method body directly. Legacy: `multer upload.single('media')`, memory storage, size limit from `appConfig.mediaPolicy.maxUploadBytes`. Field name `media` matches exactly on both sides.

**Ownership**: `NEW_API_OWNS` (`Story`, `Media`).

**Remaining uncertainty**: the exact storage-write path after multer's memory-buffer receipt (i.e. where the bytes actually land — object storage, disk, etc.) was not traced.

**Risk**: LOW.

---

## 20. `POST /common/location-master/validate-selection`

**Evidence**: `bd_locations_repository.dart:89-111`; `src/api/v1/routes.ts:43`; `src/modules/location/location.routes.ts:13`; `location.controller.ts:70-73`; `location.service.ts:118`.

**Final HTTP contract, with a path correction**: the actual Flutter-called path is **`/api/v1/location-master/validate-selection`** — there is no `/common` prefix; `location-master` is mounted as its own independent top-level module (`routes.ts:43`), distinct from the `/common` module. The original Step 3 recording of this path was inaccurate; corrected here. Request: `divisionId?/districtId?/upazilaId?/unionId?/areaId?` (only non-null fields sent), `auth:false`. Response: either a resolved/validated node set, or `{ok:false, errorCode, message}` with codes like `LOCATION_ID_NOT_FOUND`, `DISTRICT_DIVISION_MISMATCH`, `UPAZILA_DISTRICT_MISMATCH`.

**Genuine duplicate-endpoint finding**: a second, older implementation of the same capability exists at `/locations/validate-selection` (`locations.routes.ts:24`) — Flutter does not call it, but its existence alongside the newer `/location-master/validate-selection` is a real duplication the new API should consolidate rather than carry forward as two copies.

**Ownership**: `NEW_API_OWNS`.

**Remaining uncertainty**: none regarding the contract; the duplicate-route observation is itself the notable finding.

**Risk**: LOW.

---

## 21. `GET /public/countries/default`

**Evidence**: grep of the whole `lib/` tree for `publicCountryDefault` — only the `ApiEndpoints` definition, zero callers. `countries.routes.ts:5-6`.

**Final HTTP contract**: Legacy route is real, registered, and public (`countries.routes.ts` file comment: "Public country endpoints (no auth required)"). Client-side, the constant is defined but never invoked — dead code, not a missing-backend situation.

**Ownership**: `NEW_API_OWNS`.

**Remaining uncertainty**: none.

**Risk**: LOW.

---

## Ownership determinations (task requirement #4)

See `05A-data-ownership-map.md` for the full domain-by-domain map. Summary of the six named domains:

| Domain | Ownership | Basis |
|---|---|---|
| Central Auth identity | `CENTRAL_AUTH_OWNS` | `wpa_auth_api.User` is the actual credential/token issuer; `furtail_api` never verifies passwords itself for linked users |
| Local user/profile data | `NEW_API_OWNS` | `UserProfile` is populated once via JIT at first sight, then independently user-editable locally; deliberate reconciliation design (`providerAvatarUrl`/`providerDisplayName` snapshot fields) exists specifically to avoid clobbering local edits |
| Pet data | `NEW_API_OWNS` | Entirely local to `furtail_api`'s Prisma schema; no external system owns any part of it |
| Media objects and metadata | `NEW_API_OWNS` for metadata (`Media`/`MediaVariant` rows); `STORAGE_SERVICE_OWNS` for the actual bytes (MinIO/object storage, per Step 3's confirmed port-9000 dependency) |
| Fundraising campaigns | `NEW_API_OWNS` | Fully local Prisma models, no external system involvement in campaign CRUD itself |
| Donations & payment records | `NEW_API_OWNS` for the ledger/state (`Donation`, `FundraisingDonationIntent`, etc.); `PAYMENT_PROVIDER_OWNS` for the actual money movement (the specific downstream processor was not identified in this step — remains UNKNOWN by provider name, though the *pattern* of intent→attempt→webhook is confirmed) |
| Notification records & device installations | `NEW_API_OWNS` for `UserDeviceToken`/`Notification` rows; delivery itself is mediated by Firebase (external, not owned by either API) |

---

## `bpa-mobile` legacy audience — required-by determination (task requirement #5)

**Finding: `bpa-mobile` is a live, currently-active audience — not dead migration cruft.**

Evidence:
1. **Flutter does not request it.** `auth_controller.dart:249-275` (`_migrateLegacyAudienceIfNeeded`) only *detects and migrates away from* a stored `bpa-mobile`-audience token if one is found; every token-issuing call in `central_auth_api.dart` (login, register, refresh) explicitly sends `clientId: 'furtail-mobile'`.
2. **`furtail_api` tolerates it on the inbound side, within a time window.** `src/middleware/centralAuthAudiences.ts` builds the JWT-audience allow-list; `bpa-mobile` (from `CENTRAL_AUTH_LEGACY_AUDIENCES`) is accepted only while `now < CENTRAL_AUTH_LEGACY_AUDIENCE_CUTOFF` (documented in `.env.example` as `2026-08-18T00:00:00Z`, which is after today's date — the window is currently open per the template). `furtail_api`'s own code comment states explicitly: *"the BPA backend's pets proxy also forwards bpa-mobile-audience tokens."*
3. **`wpa_auth_api` still issues it, by construction, today.** `src/config/index.ts:23`: `ACCESS_TOKEN_AUDIENCE` defaults to `'bpa-mobile'` globally. `prisma/seed.ts:114`: the `"Bangladesh Pet Association"` `AuthClient` seed row has **no `clientId`/`audience` override** (unlike the `Furtail` row at `:91-107`, which explicitly sets `clientId: 'furtail-mobile', audience: 'furtail-mobile'`) — meaning BPA's client falls through to the global default and is issued `bpa-mobile`-audience tokens by design, as an active, currently-seeded `FIRST_PARTY_APP` client, not a decommissioned one. Directly spot-checked: `grep -n "Bangladesh Pet Association" wpa_auth_api/prisma/seed.ts` confirms line 114 exactly as described.

**Consumer determination**: **(b) a BPA proxy/external consumer** — confirmed active, not (a) Flutter, not (c) legacy-Furtail-only migration code (though that also exists secondarily), and not (d) "no active consumer found."

**Behavior**: unchanged, per the task's instruction. This is documented, not modified.

**Implication for the new API**: if `furtail_app_api` is meant to serve *only* the Flutter app, `bpa-mobile` acceptance is out of scope entirely — but if any future integration point (e.g. a shared endpoint BPA's proxy also hits) is planned, this is a real, currently-live external dependency to account for, time-boxed to the same `2026-08-18` cutoff `furtail_api` observes (assuming the real, non-template `.env` matches the example's documented value — not independently confirmed, since the actual runtime `.env` was never read).

---

## Financial contracts summary (task requirement #6)

Fully detailed under item 13 above. Compressed summary:

| Attribute | Value |
|---|---|
| Accepted amount format | Client sends plain `int` (field `amount`); server parses to `BigInt` minor units via `parseMinorUnits()` |
| Currency representation | `currencyCode` string (e.g. `"BDT"`), normalized server-side |
| Minor-unit/Decimal behavior | Minor-unit `BigInt` at intent/attempt stage; **no Prisma `Decimal` type used**; finalized `Donation.amount` is a separate plain `Int` field — unit-scale relationship to `*.amountMinor BigInt` is **UNKNOWN**, not traced |
| Idempotency keys | Optional client-supplied HTTP header `Idempotency-Key`; unique constraint on `FundraisingDonationIntent.idempotencyKey`; a separate `FundraisingCampaignIdempotencyKey` table exists but serves a different call site |
| Payment initiation response | `{ donationIntent, payment, reused: boolean }` |
| Callback/webhook fields | Webhook processing pipeline confirmed to exist (`FundraisingPaymentWebhook` model, dedup logic) but **the exact HTTP route path for fundraising-specific webhooks was not located** in `fundraising.routes.ts` — genuinely UNKNOWN, likely lives in a separate shared payments module not yet inspected |
| Status transitions | `FundraisingDonationIntentStatus`/`FundraisingDonationPaymentStatus`/`TransactionStatus` enums exist (all default `PENDING`); **full enum value lists not read** — UNKNOWN |
| Duplicate processing prevention | Two layers: intent-level idempotency-key uniqueness, and webhook-level `eventKey`/`providerTxKey` uniqueness plus a `processingStatus` state check |
| BigInt/Decimal serialization boundary | Real and relevant — `amountMinor` fields are Prisma `BigInt`, directly implicating the new API's `safeJsonStringify` (built in Step 4) |

**This domain carries the highest migration risk in the entire inventory** and has two explicitly unresolved questions (webhook route location, `Donation.amount`/`*.amountMinor` unit-scale relationship) that must be answered with further evidence — not assumed — before any donation-processing code is written in the new API.

---

## Pet integration behavior summary (task requirement #7)

- **Direct local database access**: yes — all pet CRUD and the entire medical/vaccination/weight/deworming/document domain is served directly from `furtail_api`'s own Prisma models (`Pet`, `PetDocument`, `PetWeight`, `Vaccination`, etc.). No evidence of a BPA proxy or Central-Auth-mediated pet data path was found.
- **BPA proxy**: `furtail_api`'s own code comments (Step 1/3 audit) mention BPA proxying *pet requests* into Furtail using `bpa-mobile`-audience tokens — meaning BPA is a *consumer* of Furtail's pet API, not an owner of pet data. Furtail's Prisma models remain authoritative.
- **Central Auth linkage**: none for pet data itself — pets are owned by a local `User` (via `ownerId`-shaped relations, not independently re-verified field name in this step), and that `User` is linked to Central Auth only for identity, not for pet records.
- **Fallback behavior**: the Flutter `adoption_repository`'s fallback to `AdoptionPetMockData` on empty/error (confirmed in Step 3) is the only fallback behavior found in the pets/adoption domain — nothing analogous exists for the core pet-profile flow itself.
- **Timeout and error mapping**: not independently re-verified in this step beyond what Step 3 already established (`ApiClient`'s 20s connect / 30s receive timeouts apply uniformly; no pet-specific timeout override was found).
- **Field ownership**: `Pet` core fields (name, species, breed, DOB, etc.) are entirely local; the aggregate `/profile` endpoint's `healthStatus.vaccinated`/`nextDueDate` fields are computed/derived from the local `Vaccination` table server-side (not an external call), even though the Flutter app never queries that table directly itself.

---

## Items with residual, explicitly-unresolved sub-questions (not fully closed by this step)

Per the verification requirement to list what remains unresolved and why, even among items marked CONFIRMED at the contract level:

1. **Donation.amount vs. amountMinor unit-scale relationship** — UNKNOWN. Would require reading the settle/finalize code path (not located/read in this step).
2. **Fundraising-specific webhook route path** — UNKNOWN. Would require locating and reading a shared `/payments/*` module not identified in the files read.
3. **Full enum value lists for `FundraisingDonationIntentStatus`/`FundraisingDonationPaymentStatus`/`TransactionStatus`** — UNKNOWN. Would require reading the Prisma schema's enum declaration blocks directly (not opened in this step).
4. **`updateMyAccount`'s server-side validation depth beyond the controller's field whitelist** — UNKNOWN. Would require reading `fundraising.service.ts`'s `updateMyAccount` function body (not read).
5. **Whether any Flutter file outside `campaign_repository.dart` calls the `/campaign/booking/*` sub-router** — UNKNOWN. Would require a full-app grep beyond the single file inspected for this domain.
6. **Whether the standalone comment PATCH/DELETE UI path is actually live in a current screen** (item 4-5 above) — UNKNOWN. Would require tracing the calling widget, not done in this step.
7. **Whether real Firebase credentials are configured in the actual (non-template) `.env`** — UNKNOWN, and correctly so per the safety rules (real `.env` files are out of scope to read).
8. **Whether `validateCampaignCoupon` does a database lookup or pure format validation** — UNKNOWN. Would require reading the coupon service's own implementation.

None of these block the CSV/report deliverables required by this step — they are recorded as concrete, scoped follow-up items rather than left implicit.
