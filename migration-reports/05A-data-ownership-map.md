# Step 5A — Data Ownership Map

Generated: 2026-07-26T10:31:12Z

Maps each domain and field group to its authoritative system, based on evidence gathered in this step and cross-referenced against Step 3's findings. Ownership values use the fixed vocabulary: `NEW_API_OWNS`, `CENTRAL_AUTH_OWNS`, `BPA_OWNS`, `STORAGE_SERVICE_OWNS`, `PAYMENT_PROVIDER_OWNS`, `LEGACY_API_TEMPORARILY_OWNS`, `UNKNOWN`.

## Identity & credentials

| Field group | System | Owner | Evidence |
|---|---|---|---|
| `email`, `phone`, `passwordHash`, `emailVerifiedAt`, `phoneVerifiedAt` (platform-level identity) | `wpa_auth_api.User` | `CENTRAL_AUTH_OWNS` | `wpa_auth_api/prisma/schema.prisma:9-49` — Central Auth is the actual token issuer and credential verifier |
| `UserCentralAuthLink.subject`, `linkMethod` | `furtail_api.UserCentralAuthLink` | `CENTRAL_AUTH_OWNS` (pure foreign reference, no local duplication) | `furtail_api/prisma/schema.prisma:140-149` — contains no PII, only a reference to the Central Auth `sub` claim |
| `UserAuth.email`, `UserAuth.phone`, `UserAuth.passwordHash` | `furtail_api.UserAuth` | **⚠ CONFLICTING/DUPLICATED — see below** | `furtail_api/prisma/schema.prisma:114-138` |

### ⚠ Flagged conflict: `email` duplication

`furtail_api.UserAuth.email` is populated **once**, at JIT-provisioning time, copied from the Central Auth token's email claim (`centralAuthLocalUser.middleware.ts:149-157`, `emailVerifiedAt` stamped "verified by Central Auth at token issuance"). **No code path was found in the files read that re-syncs this value if the user later changes their email in Central Auth.** This is a genuine risk of silent staleness — `furtail_api`'s copy can drift from Central Auth's authoritative copy with no reconciliation mechanism observed. Flagged, not resolved — a follow-up read of any Central-Auth-webhook or periodic-sync job (if one exists) would be needed to close this.

`UserAuth.phone` has the column but the JIT transaction observed (`centralAuthLocalUser.middleware.ts:142-186`) never populates it — only `email` is written. Whether some *other* code path (e.g. phone-based registration) populates `phone` independently was not traced — UNKNOWN, not a confirmed duplication in practice, only a schema-level possibility.

## Local profile / social data

| Field group | System | Owner | Evidence |
|---|---|---|---|
| `displayName`, `username`, `bio`, `avatarMediaId`, `coverMediaId`, visibility flags, gender/DOB/address, emergency contact | `furtail_api.UserProfile` | `NEW_API_OWNS` | `furtail_api/prisma/schema.prisma:151-181`; JIT-seeded once from the token's `claimUsername`/generated slug, then independently user-editable via `/user/me` PATCH (Step 3, confirmed live) |
| `providerDisplayName`, `providerAvatarUrl`, `providerKey`, `providerSyncedAt` | `furtail_api.UserProfile` | `NEW_API_OWNS` (deliberate reconciliation snapshot) | `schema.prisma:174-176` with inline comment confirming this is a *designed* mechanism to reconcile a provider's last-known values without clobbering a manually-edited local value — this is intentional dual-tracking, not accidental duplication |

### ⚠ Related conflict: `displayName`/`avatarUrl`/`bio` exist on both `wpa_auth_api.User` and `furtail_api.UserProfile`

Both systems carry these fields independently. `wpa_auth_api.User.displayName`/`avatarUrl`/`bio` (`wpa_auth_api/prisma/schema.prisma:15-22`) versus `furtail_api.UserProfile`'s own copies plus the explicit "provider snapshot" fields designed to reconcile them. Unlike the `email` case above, this duplication has a *documented, deliberate* reconciliation design (the provider-snapshot fields) — but whether that reconciliation logic actually runs on every login/token-refresh or only at JIT-creation time was **not traced** in this step (only the JIT-creation path was read). Flagged as UNKNOWN depth, not a confirmed staleness bug like `email`.

## Pet data

| Field group | System | Owner | Evidence |
|---|---|---|---|
| `Pet` core fields, `PetDocument`, `PetWeight`, `Vaccination`, `VaccinationReminder`, `DewormingRecord`, `MedicalHistory`, `VaccineType` | `furtail_api` (local Prisma) | `NEW_API_OWNS` | `furtail_api/prisma/schema.prisma:1227-1434`; entirely local, no external system involvement found |

BPA is a **consumer** of Furtail's pet API (per `furtail_api`'s own code comments about the BPA pets proxy forwarding requests), not a data owner — pet records remain authoritative in `furtail_api`'s own database regardless of which client (Furtail app or BPA proxy) reads/writes them.

## Media objects and metadata

| Field group | System | Owner | Evidence |
|---|---|---|---|
| `Media`/`MediaVariant` rows (id, ownership, references) | `furtail_api` (local Prisma) | `NEW_API_OWNS` | Step 3 finding, re-confirmed: generic `/media/upload` endpoint used across posts/pets/profile/fundraising/stories |
| Actual binary bytes | Object storage (MinIO, port 9000 in dev) | `STORAGE_SERVICE_OWNS` | Step 3 finding: `MEDIA_BASE_URL` env var, MinIO port 9000 dev config, proxied through the main API domain in prod |

This is a clean split: `furtail_api` owns the *reference* (metadata rows), the storage service owns the *bytes*. No conflicting ownership found here.

## Fundraising campaigns

| Field group | System | Owner | Evidence |
|---|---|---|---|
| `FundraisingCampaign`, `FundraisingCampaignStatusHistory`, `FundraisingUpdate`, `FundraisingAccount`, `FundraisingVerificationDocument` | `furtail_api` (local Prisma) | `NEW_API_OWNS` | Fully itemized in `05A-contract-resolution.md` items 8–12; no external system involved in campaign CRUD itself |

## Donations & payment records

| Field group | System | Owner | Evidence |
|---|---|---|---|
| `Donation`, `FundraisingDonationIntent`, `FundraisingDonationPaymentAttempt` (ledger/state) | `furtail_api` (local Prisma) | `NEW_API_OWNS` | The intent/attempt/ledger tracking itself is local |
| Actual money movement / payment processing | External payment provider | `PAYMENT_PROVIDER_OWNS` | Confirmed a webhook-driven pattern exists (`FundraisingPaymentWebhook`), but the specific downstream processor's identity/API contract was **not identified** in this step — the *fact* of provider-ownership for money movement is confirmed by the architecture (webhook ingestion pattern), the *specific provider* is UNKNOWN |
| `FundraisingPaymentWebhook` (inbound webhook log/dedup) | `furtail_api` (local Prisma) | `NEW_API_OWNS` (receiving/recording), but content originates from `PAYMENT_PROVIDER_OWNS` | `schema.prisma:1864-1880+`; the webhook's exact HTTP route path for the fundraising domain specifically was not located (flagged as unresolved in the contract-resolution report) |

## Notification records & device installations

| Field group | System | Owner | Evidence |
|---|---|---|---|
| `UserDeviceToken`, `Notification`, `NotificationRead`, `NotificationDelivery`, `UserNotificationPrefs` | `furtail_api` (local Prisma) | `NEW_API_OWNS` | `schema.prisma:865-880` and Step 3 findings; confirmed live and functioning, not a stub |
| Actual push delivery | Firebase Cloud Messaging | External, not directly owned by either API (closest fit: treat as a distinct `PAYMENT_PROVIDER_OWNS`-style external service, though the fixed vocabulary has no exact "notification provider" tag — recorded here as `UNKNOWN` provider-ownership category since the fixed enum doesn't have a precise match, while the *mechanism* itself — `admin.messaging().sendEachForMulticast()` — is confirmed real) | `pushNotification.service.ts:104-145` |

## Legacy vaccination-campaign booking (`/campaign/booking/*`)

| Field group | System | Owner | Evidence |
|---|---|---|---|
| `CampaignBooking`, `CampaignSlot`, `CampaignVaccineType`, `CampaignIncludedVaccine` | `furtail_api` (local Prisma) | `LEGACY_API_TEMPORARILY_OWNS` | Confirmed unused by the single Flutter repository file inspected for this domain (`campaign_repository.dart`) — data and routes exist and are locally owned, but no live Flutter consumer was found, so this is recorded as *legacy-temporarily* owning it pending a decision on whether the new API replicates this capability at all |

## `bpa-mobile` audience-adjacent identity

| Field group | System | Owner | Evidence |
|---|---|---|---|
| Tokens issued under the `bpa-mobile` audience | `wpa_auth_api` | `CENTRAL_AUTH_OWNS` (issuance); consumed by `BPA_OWNS` systems (the external BPA backend/proxy) | `wpa_auth_api/prisma/seed.ts:114`, `furtail_api/.env.example:37-38` — see full finding in `05A-contract-resolution.md` |

## Summary of all flagged conflicts/duplications

1. **`email`** — duplicated in `wpa_auth_api.User.email` and `furtail_api.UserAuth.email`, with a confirmed one-way, one-time JIT copy and **no observed re-sync mechanism** → genuine staleness risk.
2. **`displayName`/`avatarUrl`/`bio`** — duplicated across both systems, but with a *documented, deliberate* reconciliation design (`UserProfile.provider*` snapshot fields) — depth of that reconciliation's actual runtime behavior (does it run on every login, or only once?) is UNKNOWN, not confirmed either safe or stale.
3. **Location-master validation** — a genuine *duplicate implementation*, not a data-ownership conflict: `/location-master/validate-selection` and the older `/locations/validate-selection` both exist server-side, doing the same job. Not a cross-system ownership issue, but a same-system redundancy worth resolving in the new API's design.
4. **Certificate/verify endpoints** — similarly, `/campaign/public/certificates/*` and `/campaign-link/certificates/*` call the identical underlying functions from two separate route files — a same-system implementation duplication, not a cross-system ownership conflict.
