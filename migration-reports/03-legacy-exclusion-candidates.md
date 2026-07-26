# Step 3 — Legacy Exclusion Candidates

Generated: 2026-07-26T09:20:50Z

**This is a candidate list only. Nothing here is a deletion recommendation.**

Every candidate below was identified by checking whether an active Flutter call site exists for the corresponding `furtail_api` route/module/job/model — not by a text search of `furtail_api` alone. A route or model appearing unused by `furtail_app` does not mean it is unused by anything else: `furtail_api`'s own `.env.example` documents at least one external consumer (a "BPA" backend using a legacy `bpa-mobile` audience token) that was not inspected in this step, and `furtail_api` also serves enterprise/clinic features (owner/branch/staff/appointment/order/inventory modules, clinic queue sockets) that are entirely out of scope for a pet-social Flutter app and were never expected to be Flutter-consumed in the first place — their absence from Flutter usage is not evidence of dead code, just evidence of a different product surface within the same backend.

**Evidence and confidence are recorded per candidate below, as required.** No candidate is asserted as safe to delete.

## Search scope and method

- Flutter side: `03-endpoint-matrix.csv` and the underlying agent research covered `lib/features/**`, `lib/core/**`, and `lib/services/**` for any call to `ApiEndpoints.*`, hardcoded `ApiConfig`/`AppConfig` literal paths, and `http`/`Dio` calls with literal path strings.
- `furtail_api` side: route mounting was traced from `src/app.ts` → `src/api/v1/routes.ts` → individual `modules/*/*.routes.ts` files, and a flat list of all 164 Prisma models in the active `prisma/schema.prisma` was collected.
- **Not done in this step**: reading every controller/service file in full, tracing every Prisma model's field-level usage, or checking whether `furtail_api`'s own frontend/admin panels (if any exist outside this repo) call these routes. This limits confidence — see the confidence column.

## Candidate legacy routes (modules with no confirmed Flutter caller)

| Legacy route prefix | Module | Evidence for "unused by Flutter" | Confidence | Caveat |
|---|---|---|---|---|
| `/api/v1/ads` | `modules/ads` | No `ApiEndpoints` entry, no grep hit for "ads" as an API call anywhere in `lib/features` during either research pass | LOW | Ads could plausibly be server-driven content injected into the feed without a dedicated named endpoint (e.g. embedded in `/posts/feed` response) — not ruled out |
| `/api/v1/achievements` | `modules/achievements` | No `ApiEndpoints` entry found; `Achievement`/`UserAchievement` Prisma models exist but no confirmed Flutter read/write call site | LOW | Achievements may be displayed read-only via a field embedded in the profile response (`/user/me`) rather than a dedicated endpoint — the profile response shape was not read field-by-field |
| `/api/v1/geo` | `modules/geo` | No `ApiEndpoints` entry or call-site grep hit found | LOW | Could overlap with `/location-master/*` or `/common/bd/*` functionally under a different name; not diffed against those |
| `/api/v1/meta` | `modules/meta` | No `ApiEndpoints` entry or call-site grep hit found | LOW | Common pattern for this kind of route is app-version/feature-flag/config metadata, which could be consumed via a generic bootstrap call not distinctly named "meta" in Flutter — not confirmed either way |
| `/api/v1/webhooks` (payout webhooks) | `modules/webhooks` | By definition a server-to-server webhook receiver (payment/payout provider callbacks), not something a mobile client calls | HIGH (as "not Flutter-called", not as "unused") | This is expected to have zero Flutter call sites — it's not a client-facing endpoint at all, so it should not be excluded from the new API if payment/payout functionality is retained. Listed here only because it matches the literal search criterion ("no Flutter caller"), not because it's a genuine exclusion candidate |
| `/payments`, `/payment/eps`, `/payments/eps`, `/payments/wpa` | payment modules | No direct Flutter call site found; `furtail_api` mounts these behind a 503-fallback wrapper per the route-mapping research, suggesting they may already be disabled/incomplete in the legacy system itself | MEDIUM | Donations/checkout do go through `/fundraising/campaigns/:id/donate` and `/campaign/public/checkout/*`, which may themselves internally call into these payment modules server-side — a client not calling a route directly doesn't mean the route is unreachable via internal server-to-server calls |
| `/user-api/*` (as literally requested in the Step 3 cross-reference) | n/a | Confirmed this mount does not exist in `furtail_api` at all (`grep -rn "user-api" src` returned zero matches) | HIGH | Not a real exclusion candidate — this was a Flutter-side path-notation artifact, not an actual `furtail_api` route. The real, matching route (`/api/v1/user/pets/*`) **is** used and is **not** a candidate for exclusion. Listed here only to explicitly close out the discrepancy raised in Step 3's instructions. |

## Candidate unused sub-features within otherwise-active modules

| Item | Evidence | Confidence | Caveat |
|---|---|---|---|
| `GET /api/v1/reports/reasons` | Defined in Flutter's `ApiEndpoints.reportReasons()` but grep found zero call sites anywhere in `lib/`; `furtail_api`'s `reports.routes.ts` also has no matching `/reasons` route (only `/`, `/sales`, `/top-products`, `/zero-sales`, `/stock`, `/revenue` — the latter five are unrelated enterprise sales-report routes reusing the same path prefix) | HIGH (both sides agree it's unimplemented) | Not truly a "legacy route to exclude" since it doesn't exist on the backend either — recorded here because it demonstrates a confirmed-dead client-side constant, which is a related but distinct finding from a true unused *backend* route |
| `${ApiConfig.userApi}/profile` (`ApiEndpoints.myProfile()`/`updateMyProfile()`) | Flutter defines these constants but the live `ProfileService` bypasses them entirely, using hardcoded `${ApiConfig.apiV1}/user/me` literals instead | MEDIUM | The underlying `furtail_api` route this constant would have hit does still exist and is used via the other path — this is a *client-side dead constant*, not necessarily a backend route that should be excluded, since `/user/me` (used via the literal path) maps to the same module |
| Reason-code reporting flow in general | See above | HIGH | n/a |

## Candidate unused Prisma models (no confirmed Flutter-facing route touches them)

Cross-referencing the 164-model list from `furtail_api`'s `prisma/schema.prisma` against every model cited as backing a Flutter-confirmed endpoint in `03-endpoint-matrix.csv`, the following categories of models had **no model name appearing in any confirmed-endpoint row**:

| Model group | Examples | Evidence | Confidence | Caveat |
|---|---|---|---|---|
| Enterprise/clinic/branch operations | `Organization`, `Branch`, `BranchRoom`, `BranchPolicy`, `BranchMember`, `Appointment`, `Visit`, `Role`, `Order`, `OrderPayment`, `PaymentTransactionLog`, `PaymentTransaction`, `Service`, `InventoryLocation`, `Warehouse`, `OwnerOnboardingState` | No Flutter feature area (posts, adoption, fundraising, pets, wallet, notifications, stories, social) references appointments, orders, branches, or inventory in any confirmed call site | HIGH (as "not used by this Flutter app") | These almost certainly back a *different* product surface (an enterprise/clinic-management panel) sharing the same `furtail_api` database — not evidence they are unused overall. Excluding these from `furtail_app_api`'s scope is very likely correct (they're out of scope for a pet-social consumer app), but that is a scoping decision, not a "dead code" finding |
| Owner/KYC/verification | `OwnerProfile`, `OwnerKyc`, `OwnerKycDocument`, `OrganizationLegalProfile`, `OrganizationDocument`, `BranchProfileDetails`, `VerificationLog`, `VerificationCase`, `VerificationDocument`, `VerificationCaseEvent`, `VerificationLockedUpdateAttempt` | No Flutter call site references KYC/owner-verification anywhere in the researched feature areas | HIGH (not used by this Flutter app) | Same caveat — likely belongs to the enterprise/owner-onboarding surface, not evidence of true dead code across the whole `furtail_api` system |
| Country/state policy engine | `CountryPolicy`, `PolicyFeature`, `PolicyDonationRule`, `PolicyPaymentMethod`, `PolicyAdsRule`, `PolicyRule`, `StatePolicy`, `StatePolicyFeature`, `StatePolicyRule` | No Flutter call site directly reads a `/policy` or `/country-policy`-shaped endpoint; policy values may instead be baked into the response shape of other endpoints (e.g. `donationEnabled` flags surfaced through `/fundraising/*` or `/auth/bootstrap`) which was not verified field-by-field | LOW | Feature-flag-shaped systems are frequently consumed indirectly (a boolean embedded in another response) rather than via a dedicated endpoint — genuinely unclear without reading response-shape details of the endpoints that are used |
| Campaign rollout/staff/audit internals | `CampaignRolloutPhase`, `CampaignRolloutRegion`, `CampaignPreRegistration`, `CampaignStaff`, `CampaignSmsTemplate`, `CampaignSmsLog`, `SmsLog`, `CampaignAuditLog`, `CampaignConfigHistory` | These support the *admin/staff* side of the vaccination-campaign feature (rollout management, SMS templates, audit trails), not the *consumer* booking flow Flutter uses | MEDIUM | Consistent with `furtail_api` serving both a public consumer app and an internal admin/staff tool from one backend — not evidence these models are dead, just that they're not part of `furtail_app_api`'s consumer-facing scope |
| Achievements | `Achievement`, `UserAchievement` | No confirmed Flutter call site (see route-level finding above) | LOW | Same caveat as the `/achievements` route above — could be embedded in another response |
| Ads | `Ad` | No confirmed Flutter call site (see route-level finding above) | LOW | Same caveat as the `/ads` route above |
| Audit/generic | `AuditLog` | Purely a server-internal audit trail model, not expected to have a client-facing endpoint by nature | HIGH (as "not client-facing", not as "unused") | Not a genuine exclusion candidate — audit logging is typically infrastructure, retained regardless of client usage |

## Candidate unused background jobs

| Job | Evidence | Confidence | Caveat |
|---|---|---|---|
| `expireBranchPermissions.job.ts` | Operates on branch/permission models with no confirmed Flutter-facing route touching them (see enterprise/clinic model group above) | MEDIUM | Consistent with being enterprise-surface-only, not confirmed dead — that surface may still be actively used by a non-Flutter client |
| `kycExpiryRetention.job.ts` | Operates on KYC models with no confirmed Flutter-facing route | MEDIUM | Same caveat |
| `staffInviteCleanup.ts` | Already disabled/commented out in `furtail_api`'s own `index.ts` per the reference-mapping research | HIGH (already inert in the legacy system itself) | Not a "should we exclude it" question — `furtail_api` itself has already stopped running it |
| `expiryEngine.job` (referenced in `index.ts` comments, file not independently located) | `index.ts` comment explicitly states "Furtail-CLEANUP Phase 3 — enterprise-only, not required by Flutter app" | HIGH (self-documented by the legacy codebase's own maintainers) | This is the legacy project's own prior conclusion, not one derived independently in this audit — worth treating as strong corroborating evidence, not primary evidence |
| `ownersTeamAutomation.job` (same source as above) | Same `index.ts` comment | HIGH (self-documented) | Same as above |

## Candidate unused integrations

| Integration | Evidence | Confidence | Caveat |
|---|---|---|---|
| Direct payment-gateway-specific routes (`/payments/eps`, `/payments/wpa`) as distinct from the fundraising/campaign checkout flows Flutter does call | See "payment modules" row above | MEDIUM | Could be internally invoked server-side by the routes Flutter *does* call; not independently traced at the controller/service level in this step |
| Enterprise clinic/doctor-queue Socket.IO events (`QUEUE_UPDATED`, `NOW_SERVING_CHANGED`, `ESTIMATE_UPDATED`, `DOCTOR_QUEUE_UPDATED`) | No Flutter socket client exists at all (see `03-flutter-api-inventory.md`, "Real-time flow") | HIGH (Flutter has zero socket usage of any kind) | These almost certainly serve a separate clinic-facing web/kiosk client, not `furtail_app` — legitimate exclusion candidate for `furtail_app_api`'s scope specifically, though obviously not for whatever system does consume them |

## Summary

Nothing in this list should be treated as approved for deletion from `furtail_api` (which remains untouched and read-only per the mandatory safety rules) or as approved for *exclusion* from `furtail_app_api`'s eventual scope without a human decision — this document exists to surface candidates with their supporting evidence and honestly-stated confidence, per the Step 3 instructions. The clearest, highest-confidence category is the enterprise/clinic/owner-onboarding surface (organizations, branches, appointments, KYC, staff, clinic sockets) — but even there, "not used by this Flutter app" is being conflated with "unused" only insofar as it's out of scope for `furtail_app_api`; whatever consumes that surface today (a separate admin panel, most likely) is unaffected by this audit and outside its scope to assess.
