# Step 5A — Prisma Input Catalog

Generated: 2026-07-26T10:31:12Z

This lists only database capabilities *proven necessary* by an actual, evidence-backed Flutter call site (Step 3 + Step 5A resolution), scoped to entities newly clarified or split in this step. It does **not** attempt to catalog every entity for the whole API (that remains Step 3's broader inventory) — it focuses on the domains this step deepened: fundraising CRUD/updates/account/donations, pet medical (and the explicit non-necessity finding), notifications, stories, and location. No Prisma syntax is written here, per the task's explicit instruction — this is a capability catalog, not a schema draft.

For each entity: purpose, endpoint dependency, authoritative owner, read/write requirement, legacy model references, required relations, required uniqueness, required indexes, retention/soft-delete need, and whether a local table is actually necessary (some entities in this domain turned out **not** to be necessary, and that's recorded explicitly, not silently dropped).

---

## FundraisingCampaign

- **Purpose**: represents a fundraising campaign — the core entity for the feed, my-campaigns, campaign detail, and CRUD endpoints.
- **Endpoint dependency**: `GET /fundraising/feed`, `GET /fundraising/my/campaigns`, `GET /fundraising/campaigns/{id}`, `POST /fundraising/campaigns`, `PATCH /fundraising/campaigns/{id}`, `DELETE /fundraising/campaigns/{id}`, plus the draft sub-flow (`POST .../drafts`, `GET/PATCH .../{id}/draft`, `POST .../{id}/submit`).
- **Authoritative owner**: `NEW_API_OWNS`.
- **Read/write requirement**: both — created/updated/deleted by the account owner; read by feed (public/optional-auth) and my-campaigns (auth-required, scoped to the caller's account).
- **Legacy model reference**: `FundraisingCampaign` (`furtail_api/prisma/schema.prisma:1641-1723`).
- **Required relations**: to an account/owner entity (many campaigns per account); to a post/media entity for cover imagery (confirmed via `post.media[0].media.url` in the feed response); to a stats aggregate (donor count, raised amount).
- **Required uniqueness**: `slug` must be unique (used as a lookup key in at least one confirmed call, `fetchCampaignBySlug` in the campaign-public domain — a sibling `Campaign` entity, distinct from `FundraisingCampaign`, but the uniqueness pattern is the same requirement class); `publicId` appears to serve as an external-facing stable identifier (confirmed present in the response shape).
- **Required indexes**: something supporting cursor pagination ordered by `(createdAt, id)` — confirmed by the composite-cursor encode/decode logic (`encodeCompositeCursor({createdAt, id})`).
- **Retention/soft-delete**: yes — `deletedAt` is checked in the my-campaigns query filter (`deletedAt: null`), confirming soft-delete is the intended deletion semantic, not hard delete.
- **Local table necessary?** **Yes** — proven necessary by 8 confirmed, actively-called endpoints.

## FundraisingCampaignStatusHistory

- **Purpose**: audit trail of campaign status transitions (draft→submitted→published→etc.).
- **Endpoint dependency**: written server-side as a side effect of campaign create/update/status-changing operations — never directly read or written by a Flutter call site itself.
- **Authoritative owner**: `NEW_API_OWNS`.
- **Read/write requirement**: write-only from the Flutter app's perspective (the app triggers status changes indirectly via `PATCH .../{id}` with a `status` field; the history row is a server-side consequence, not something the app reads back).
- **Legacy model reference**: `FundraisingCampaignStatusHistory` (`schema.prisma:1725-1737`).
- **Required relations**: to `FundraisingCampaign` (many history rows per campaign).
- **Required uniqueness**: none identified.
- **Required indexes**: likely `campaignId` + `createdAt` for chronological retrieval, though no confirmed read-endpoint exists to validate this need directly.
- **Retention/soft-delete**: append-only audit log — no deletion semantic expected.
- **Local table necessary?** **Yes, but with lower confidence than `FundraisingCampaign` itself** — necessary only if the new API intends to preserve audit-trail behavior; if audit history isn't a product requirement for the new API, this could be deferred. Not proven necessary by a *direct* Flutter call site (no endpoint reads it), only by the *pattern* of the legacy system doing it as an audit safeguard.

## FundraisingUpdate

- **Purpose**: campaign progress updates ("we've reached 50% of our goal!").
- **Endpoint dependency**: `GET /fundraising/campaigns/{id}/updates`, `POST .../updates`, `PATCH /fundraising/updates/{updateId}`, `DELETE /fundraising/updates/{updateId}`.
- **Authoritative owner**: `NEW_API_OWNS`.
- **Read/write requirement**: both.
- **Legacy model reference**: `FundraisingUpdate` (`schema.prisma:1541-1553`).
- **Required relations**: to `FundraisingCampaign` (`campaignId`); to a post/content entity (`postId`, unique) — **the legacy design stores update *content* on a linked `Post` row, not on `FundraisingUpdate` itself**, making `FundraisingUpdate` a thin join table. This is a real design decision to evaluate for the new API: replicate the join-to-Post pattern, or fold update content directly into its own table. Recorded as a design question, not resolved here.
- **Required uniqueness**: `postId` unique (one post per update, per the legacy schema).
- **Required indexes**: cursor-pagination support (`limit`+`cursor` confirmed used client-side).
- **Retention/soft-delete**: `deletedAt` field present in legacy schema — soft-delete confirmed as the pattern.
- **Local table necessary?** **Yes** — proven necessary by 4 confirmed endpoints.

## FundraisingAccount

- **Purpose**: the fundraiser's identity/verification profile — a prerequisite for creating campaigns (my-campaigns lookup queries this first).
- **Endpoint dependency**: `GET /fundraising/account/me`, `PATCH /fundraising/account`, `POST /fundraising/account/submit`.
- **Authoritative owner**: `NEW_API_OWNS`.
- **Read/write requirement**: both.
- **Legacy model reference**: `FundraisingAccount` (`schema.prisma:1555-1609`).
- **Required relations**: one-to-one (or one-to-many-but-effectively-one) with a user/owner entity, referenced via `userId` in the legacy `findFirst` lookup pattern.
- **Required uniqueness**: implicitly one active account per user (confirmed by `findFirst` rather than `findMany` usage in the my-campaigns lookup).
- **Required indexes**: `userId` (used directly in the confirmed lookup query).
- **Retention/soft-delete**: `deletedAt` filter confirmed (`deletedAt: null` in the my-campaigns account lookup).
- **Local table necessary?** **Yes** — proven necessary; account existence gates whether a user can have any campaigns at all.

## FundraisingVerificationDocument

- **Purpose**: KYC-adjacent identity documents attached to a fundraising account.
- **Endpoint dependency**: `POST /fundraising/account/documents`, `DELETE /fundraising/account/documents/{id}`.
- **Authoritative owner**: `NEW_API_OWNS`.
- **Read/write requirement**: write-heavy (create/delete); no confirmed dedicated *read/list* endpoint call site was found (the account's `GET /me` response may embed a document list, but this wasn't independently confirmed in this step).
- **Legacy model reference**: `FundraisingVerificationDocument` (`schema.prisma:1627-1639`) — `accountId, title, mediaId, createdAt, deletedAt?` — matches the Flutter `{title, mediaId}` payload exactly.
- **Required relations**: to `FundraisingAccount` (`accountId`); to `Media` (`mediaId`) — this table stores a *reference*, not the file itself, confirming the generic media-upload pattern applies here too.
- **Required uniqueness**: none identified.
- **Required indexes**: `accountId` for listing.
- **Retention/soft-delete**: `deletedAt` present — soft-delete pattern.
- **Local table necessary?** **Yes** — proven necessary by 2 confirmed endpoints.

## FundraisingAccountStatusLog

- **Purpose**: admin-side audit trail of account verification status changes.
- **Endpoint dependency**: none confirmed from the Flutter app — this is written/read only by admin routes (`fundraising.routes.ts:83-84`, not called by Flutter).
- **Authoritative owner**: `NEW_API_OWNS`, but exclusively for an admin-facing capability, not a mobile-app capability.
- **Read/write requirement**: none from the mobile API's perspective.
- **Legacy model reference**: `FundraisingAccountStatusLog` (`schema.prisma:1611-1625`).
- **Local table necessary?** **Not proven necessary for the mobile-facing `furtail_app_api`.** This is an admin-console capability. Recording explicitly: this is a case where a legacy model exists and is real, but the evidence shows it serves a *different consumer* (an admin panel) than the one `furtail_app_api` is scoped to serve. Whether the new API needs to reproduce admin capabilities at all is a separate scoping question outside this step's remit — flagged, not decided.

## Donation, FundraisingDonationIntent, FundraisingDonationPaymentAttempt

- **Purpose**: the donation/payment ledger — intent (what the donor wants to pay), attempt (a specific processor interaction), and the finalized `Donation` record.
- **Endpoint dependency**: `POST /fundraising/campaigns/{id}/donate`, `GET /fundraising/campaigns/{id}/donations`.
- **Authoritative owner**: `NEW_API_OWNS` for the ledger rows; `PAYMENT_PROVIDER_OWNS` for the actual money movement they represent.
- **Read/write requirement**: both — write on donate, read on the donations-list endpoint.
- **Legacy model reference**: `Donation` (`schema.prisma:1783-1788`, `amount: Int`), `FundraisingDonationIntent` (`:1818-1822`, `amountMinor: BigInt`), `FundraisingDonationPaymentAttempt` (`:1848-1850`, `amountMinor: BigInt`).
- **Required relations**: `Donation`↔`FundraisingCampaign`; `FundraisingDonationIntent`↔`FundraisingDonationPaymentAttempt` (one intent, potentially multiple attempts, e.g. retries).
- **Required uniqueness**: `FundraisingDonationIntent.idempotencyKey` — confirmed unique, load-bearing for duplicate-prevention.
- **Required indexes**: campaign-scoped listing (`campaignId` + cursor fields for the donations-list endpoint).
- **Retention/soft-delete**: not confirmed either way — financial records are frequently retained indefinitely for compliance rather than soft-deleted; not verified in this step.
- **Local table necessary?** **Yes, unambiguously** — this is the highest-confidence "must exist" entity in the entire catalog, proven by two confirmed endpoints and explicitly flagged as the highest-risk domain in the contract-resolution report.
- **⚠ Open design question before schema design**: the `Donation.amount Int` vs. `*.amountMinor BigInt` type/scale mismatch (flagged in `05A-contract-resolution.md` item 13) must be resolved with further evidence — reading the settle/finalize code path — before the new API's schema commits to a specific numeric type for the donation amount. **Recommendation: do not simply copy `Int` for the new schema without first resolving this question**, since perpetuating an unclear/possibly-inconsistent unit scale into a financial ledger is a real risk.

## FundraisingPaymentWebhook

- **Purpose**: inbound webhook event log and dedup ledger for payment-provider callbacks.
- **Endpoint dependency**: **UNKNOWN** — the exact HTTP route this table's writes originate from was not located in `fundraising.routes.ts` (flagged as unresolved).
- **Authoritative owner**: `NEW_API_OWNS` for the record; content originates from `PAYMENT_PROVIDER_OWNS`.
- **Legacy model reference**: `FundraisingPaymentWebhook` (`schema.prisma:1864-1880+`), unique constraints on `eventKey` and `providerTxKey`.
- **Local table necessary?** **Likely yes, but not fully proven in this step** — the pattern (webhook ingestion + dedup) is clearly necessary for a correct payment integration, but since the exact route wasn't located, this entity's necessity is inferred from architecture rather than directly confirmed by a traced HTTP call site. Flagged for a follow-up investigation (locate the actual webhook route) before finalizing.

## Pet medical/vaccination/weight/deworming/document family (Vaccination, VaccinationReminder, DewormingRecord, MedicalHistory, PetWeight, PetDocument, VaccineType)

- **Purpose**: clinical/health record-keeping per pet.
- **Endpoint dependency**: **none** — this is the key finding of this step's Group F investigation. No Flutter call site exists for any of these seven models beyond a coarse, computed `healthStatus.vaccinated`/`nextDueDate` summary embedded in the aggregate `GET /user/pets/{id}/profile` response (which itself is powered by `Vaccination`/`PetWeight` server-side, without the app ever querying those tables directly).
- **Authoritative owner**: `LEGACY_API_TEMPORARILY_OWNS` (data and capability exist only in the legacy system today).
- **Legacy model references**: `Vaccination` (`schema.prisma:1317-1371`), `VaccinationReminder` (`:1373-1404`), `DewormingRecord` (`:1406-1419`), `MedicalHistory` (`:1421-1434`), `PetWeight` (`:1291-1301`), `PetDocument` (`:1227-1247`), `VaccineType` (`:1303-1315`).
- **Local table necessary?** **NOT PROVEN NECESSARY by any current Flutter call site.** This is an explicit, evidence-based finding, not an oversight: every screen was checked (`pet_profile_screen.dart` read in full), and the "Medical History"/"Diet Chart"/"Gallery" UI affordances that *look* like they'd need this data are confirmed hardcoded `SnackBar` stubs with zero backend calls behind them.
  - **Recommendation**: do **not** build these seven tables into the new API's initial Prisma schema based on current evidence. If a future product decision reactivates these UI stubs into real screens, that would constitute new, traceable endpoint requirements at that time — building this rich clinical schema speculatively now, with zero current consumers, would violate the "minimal, evidence-based schema" architecture decision from Step 2.
  - **Caveat**: the *aggregate* `healthStatus.vaccinated`/`nextDueDate` fields on the `/profile` response **are** proven necessary (real Flutter consumer) — but they could plausibly be served by a much simpler computed/denormalized field (e.g. a single "vaccination status" summary column on `Pet` itself) rather than requiring the full clinical `Vaccination` table with its administering-org/branch/certificate-token/campaign-linkage complexity, *if* the new API doesn't intend to eventually support the fuller vaccination-history feature. This is a scoping decision for whoever designs the actual schema, not resolved here — flagged as the key trade-off.

## UserDeviceToken

- **Purpose**: push-notification device registration.
- **Endpoint dependency**: `POST /notifications/device-token`, `DELETE /notifications/device-token` — confirmed live call sites (via Firebase-messaging init, not the seemingly-dead `registerPushAfterAuth()`).
- **Authoritative owner**: `NEW_API_OWNS`.
- **Read/write requirement**: both (upsert on register, `updateMany` soft-deactivate on unregister).
- **Legacy model reference**: `UserDeviceToken` (`schema.prisma:865-880`).
- **Required relations**: to `User` (`userId`).
- **Required uniqueness**: `token` unique (confirmed — the upsert is keyed on this).
- **Required indexes**: `[userId, isActive]`, `[platform]` (both confirmed present in the legacy schema).
- **Retention/soft-delete**: `isActive` boolean flag pattern (not `deletedAt`) — deactivation via `isActive:false`, not row deletion.
- **Local table necessary?** **Yes** — proven necessary, and further confirmed non-speculative by the existence of a real, functioning downstream consumer (`pushNotification.service.ts`'s `sendEachForMulticast` call reading these rows).

## Story, StoryView

- **Purpose**: ephemeral story posts and view tracking.
- **Endpoint dependency**: `POST /stories` (confirmed direct multipart upload), `GET /stories/feed`, `POST /stories/{id}/view`, `DELETE /stories/{id}` (all confirmed in Step 3, reconfirmed here for the creation contract specifically).
- **Authoritative owner**: `NEW_API_OWNS`.
- **Legacy model references**: `Story`, `StoryView` (Step 3 finding, field-level detail not re-verified in this step).
- **Local table necessary?** **Yes** — proven necessary; no new finding changes this from Step 3.

## Location-master hierarchy (BdDivision/BdDistrict/BdUpazila/BdUnion/BdArea, or the parallel generic hierarchy)

- **Purpose**: administrative-region reference data for address/location selection and validation.
- **Endpoint dependency**: `POST /location-master/validate-selection` (path-corrected in this step), plus the broader division/district/upazila/union listing endpoints already confirmed in Step 3.
- **Authoritative owner**: `NEW_API_OWNS`.
- **Local table necessary?** **Yes**, but with an explicit design note: this step reconfirmed Step 3's finding that **two parallel legacy implementations exist** (`/common/bd/*` and `/location-master/*`), doing overlapping jobs, plus a **duplicate validate-selection route** (`/locations/validate-selection` vs. `/location-master/validate-selection`) that Flutter only calls one of. **Recommendation: the new API should design a single, consolidated location-hierarchy schema, not port both legacy systems.** Which specific hierarchy (BD-specific vs. generic) to keep is a product/schema-design decision outside this step's scope — flagged for Step 5B/6, not decided here.

---

## Cross-cutting notes for schema design (not entity-specific)

1. **BigInt fields are real and must be planned for** — `amountMinor` on multiple fundraising models. The new API's Step 4 `safeJsonStringify` (BigInt→string serialization, tested) is directly relevant infrastructure already in place for this.
2. **Soft-delete (`deletedAt`) is the dominant deletion pattern** across every entity checked in this step (`FundraisingCampaign`, `FundraisingUpdate`, `FundraisingAccount`, `FundraisingVerificationDocument`) — the one exception found is `UserDeviceToken`, which uses an `isActive` boolean instead. Both patterns should be considered deliberately for each new entity, not defaulted to one or the other without reason.
3. **Do not build the pet-medical family speculatively** — the single clearest "don't build this yet" finding of this entire step.
4. **Two duplicate-implementation pairs identified** (location validate-selection, certificate/verify routes) — the new API's schema/route design should consolidate these, not replicate the legacy duplication.
5. **Payment-webhook route location is unresolved** — do not finalize the `FundraisingPaymentWebhook`-equivalent schema without first locating and reading the actual webhook HTTP entrypoint in a follow-up investigation.
