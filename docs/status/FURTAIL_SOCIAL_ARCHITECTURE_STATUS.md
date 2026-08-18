# FURTAIL SOCIAL ARCHITECTURE — CURRENT STATUS

**Last Updated**: 2026-08-18 (Mega Job Phase 3A investigation)
**Repository State**: `furtail_app_api` working tree has 38 modified files; only
`social-store.ts` is confirmed to contain solely the documented Phase 2 diff.
`social.routes.ts` has a 1088-line diff, ~90% of which is unrelated, unreviewed,
uncommitted feature work (discovery/suggestions/relationship-count endpoints).
**Overall Status**: 🔴 NOT PRODUCTION READY — BLOCKED BY PRISMA MIGRATION AND BY
unrelated uncommitted work entangled in the persistence-slice route file. See
`docs/jobs/FURTAIL_PHASE_3_PERSISTENT_SOCIAL_CORE_JOB.md` § Phase 3A Investigation
Findings for full evidence and the decision needed to unblock.

---

## EXECUTIVE SUMMARY

Phase 1 (forensic audit) completed successfully. Phase 2 (hardening) partially implemented with code changes, but production verification (Phase 2B) identified critical blockers that prevent deployment.

**Current Situation**:
- Architecture audit complete ✅
- Code changes committed to Phase 2 (idempotency, media validation)
- Production verification completed 🟡
- Critical blockers identified 🔴
- Prisma migration required before deployment

**Recommendation**: Do not deploy Phase 2. Proceed to Phase 3 (Prisma migration) which provides the foundation needed.

---

## WORK COMPLETION STATUS MATRIX

### Architecture & Design
| Item | Status | Evidence |
|------|--------|----------|
| Shared Core API preserved | ✅ COMPLETE | Phase 1 audit, no BFFs created |
| Web proxy pattern verified | ✅ COMPLETE | Phase 1 audit, code inspection |
| Flutter direct client pattern | ✅ COMPLETE | Phase 1 audit, Phase 2B verified |

### Post Creation API
| Item | Status | Evidence |
|------|--------|----------|
| Route handler exists | ✅ COMPLETE | social.routes.ts:1742-1788 |
| Domain service exists | ✅ COMPLETE | social-store.ts:1839-1897 |
| Request contract stable | ✅ COMPLETE | Phase 1 audit verified |
| Response contract stable | ✅ COMPLETE | Phase 1 audit verified |

### Post Update/Delete
| Item | Status | Evidence |
|------|--------|----------|
| Update route | ✅ COMPLETE | social.routes.ts:1800-1840 |
| Delete route | ✅ COMPLETE | social.routes.ts:1843-1857 |
| Ownership validation | ✅ COMPLETE | social-store.ts:1918-1935 |

### Post Persistence
| Item | Status | Evidence |
|------|--------|----------|
| Prisma schema defined | ✅ COMPLETE | prisma/schema.prisma:378-428 |
| Prisma Post table | 🔴 BLOCKED | No `prisma.post.create()` anywhere in codebase |
| Prisma PostMedia table | 🔴 BLOCKED | No media-post linkage in Prisma |
| Prisma PostComment table | 🔴 BLOCKED | No comment persistence implemented |
| In-memory fallback | ✅ COMPLETE | social-store.ts in-memory maps exist |
| Production runtime path | ⚪ NOT VERIFIED | Prisma unused; actual persistence undefined |

### Media Ownership
| Item | Status | Evidence |
|------|--------|----------|
| In-memory validation added | ✅ COMPLETE | social-store.ts:1844-1856 (createPost), 1918-1935 (updatePost) |
| Validation on create | ✅ COMPLETE | Checks media.get(mediaId) exists and ownership |
| Validation on update | ✅ COMPLETE | Checks new media IDs |
| Prisma validation | ⚪ NOT VERIFIED | No Prisma calls, only in-memory checks |
| Production path verification | 🔴 BLOCKED | Posts don't persist to Prisma |

### Media Status Validation
| Item | Status | Evidence |
|------|--------|----------|
| FAILED media rejection | ⚪ NOT VERIFIED | No status field check in createPost |
| PROCESSING media handling | ⚪ NOT VERIFIED | No status field check in createPost |
| Deleted media rejection | ⚪ NOT VERIFIED | No soft-delete check for media |

### Post Idempotency
| Item | Status | Evidence |
|------|--------|----------|
| Store-level tracking | ✅ COMPLETE | postCreationIdempotencyKeys Map added |
| In-memory deduplication | ✅ COMPLETE | social-store.ts:1840-1843 (check), 1890-1893 (store) |
| Database persistence | 🔴 BLOCKED | No Prisma idempotency table/column |
| Restart safety | 🔴 BLOCKED | In-memory Map lost on restart |
| Multi-instance safety | 🔴 BLOCKED | Each instance has own Map |
| TTL/cleanup | 🔴 BLOCKED | No bounded retention, memory leak risk |

### Web Idempotency Lifecycle
| Item | Status | Evidence |
|------|--------|----------|
| API client sends keys | ✅ COMPLETE | api-client.ts:36-38 (sends UUID per POST) |
| Key persistence across retries | 🔴 BLOCKED | Generates NEW UUID every POST request, not per logical operation |
| Create Post mutation ownership | 🔴 BLOCKED | No draft/mutation layer managing idempotency key |
| Create Post specific handling | ⚪ NOT VERIFIED | Generic "all POST requests" approach doesn't work for retries |

### Flutter Idempotency Lifecycle
| Item | Status | Evidence |
|------|--------|----------|
| Idempotency key generation | 🔴 BROKEN | posts_remote_ds.dart:376 generates NEW UUID EVERY call |
| Key sent to server | ✅ COMPLETE | Header set on line 378 |
| Retry handling | 🔴 BROKEN | Retried call generates new UUID (different key) |
| Logical operation ownership | 🔴 BLOCKED | No higher-level idempotency key management |
| Duplicate on retry risk | 🔴 BROKEN | Retry with different key creates duplicate post |

### Privacy & Authorization
| Item | Status | Evidence |
|------|--------|----------|
| whoCanComment rule existence | ✅ COMPLETE | social.routes.ts:1994-2008 |
| whoCanComment enforcement location | 🟡 PARTIAL | Route layer when Prisma available; not in store |
| whoCanComment documented | ✅ COMPLETE | Architectural note added (lines 2000-2004) |
| Post ownership checks | ✅ COMPLETE | social-store.ts:1864, 1909-1910 |
| Post visibility enforcement | ✅ COMPLETE | ensureCanViewPost() method exists |
| Production applicability | 🔴 BLOCKED | Privacy rules exist but posts don't persist |

### Response Contract & Compatibility
| Item | Status | Evidence |
|------|--------|----------|
| API response shape | ✅ COMPLETE | Verified stable in Phase 1 |
| Web normalization layer | ✅ COMPLETE | posts.ts:115-122 (normalizeList) |
| Web client usage | ✅ COMPLETE | Creates Post interface from API response |
| Flutter deserialization | ✅ COMPLETE | PostModel.fromJson works |
| Backward compatibility | ✅ COMPLETE | idempotencyKey is optional field |

### Web Create Post Feature
| Item | Status | Evidence |
|------|--------|----------|
| UI component exists | ✅ COMPLETE | create-post-modal.tsx |
| Media upload | ✅ COMPLETE | Form submission works |
| Caption/metadata | 🟡 PARTIAL | Supports caption only; missing privacy, emotions, tags, music |
| Feature parity with Flutter | 🔴 BLOCKED | Web missing privacy selection, pet tagging, music metadata, feelings/activities |

### Flutter Compatibility
| Item | Status | Evidence |
|------|--------|----------|
| HTTP client setup | ✅ COMPLETE | posts_remote_ds.dart uses http package |
| Post creation call | ✅ COMPLETE | createPost method exists |
| Media upload flow | ✅ COMPLETE | uploadMedia method exists |
| Feature completeness | ✅ COMPLETE | Flutter supports all post fields |
| Idempotency implementation | 🔴 BROKEN | Generates new UUID per call |

### Automated Tests
| Item | Status | Evidence |
|------|--------|----------|
| Backend tests written | 🔴 BLOCKED | No tests added for idempotency, media validation |
| Backend tests run | 🔴 BLOCKED | No test execution performed |
| Web tests written | 🔴 BLOCKED | No tests added |
| Web tests run | 🔴 BLOCKED | No test execution performed |
| Flutter tests written | 🔴 BLOCKED | No tests added |
| Flutter tests run | 🔴 BLOCKED | No test execution performed |

### Production Readiness
| Item | Status | Evidence |
|------|--------|----------|
| Post persistence in Prisma | 🔴 BLOCKED | Schema defined but unused; no prisma.post.create() anywhere |
| Idempotency durable storage | 🔴 BLOCKED | Only in-memory Map |
| Multi-instance support | 🔴 BLOCKED | In-memory Map not shared across instances |
| Restart safety | 🔴 BLOCKED | Data lost on server restart |
| Production verification | 🔴 BLOCKED | Phase 2B audit found critical issues |

---

## CODE CHANGES DOCUMENTED IN PHASE 2

### Backend Changes (UNCOMMITTED)

**File**: `furtail_app_api/src/modules/social/social-store.ts`
- Line 476: Added `idempotencyKey?: string | null;` to SocialPostUpsertInput interface
- Line 908-913: Added postCreationIdempotencyKeys Map for in-memory deduplication
- Line 1840-1843: Added idempotency key check in createPost method
- Line 1844-1856: Added media ownership validation in createPost method
- Line 1890-1893: Added idempotency key storage after successful post creation
- Line 1918-1935: Added media ownership validation in updatePost method

**File**: `furtail_app_api/src/routes/social.routes.ts`
- Line 1748-1752: Extract Idempotency-Key from header or body
- Line 1777: Pass idempotencyKey to store.createPost()
- Line 2000-2004: Added architectural comment explaining whoCanComment is domain rule

**Status**: Changes present in working tree but NOT YET COMMITTED to git

### Web Client Changes

**None** - Web already sends idempotency keys via api-client.ts (no changes needed)

### Flutter Client Changes (UNCOMMITTED)

**File**: `furtail_app/lib/features/posts/data/datasources/posts_remote_ds.dart`
- Line 6: Added `import 'package:uuid/uuid.dart';`
- Line 376: Generate UUID per createPost call (❌ BROKEN IMPLEMENTATION)
- Line 377-378: Set Idempotency-Key header

**Status**: Changes present in working tree but NOT YET COMMITTED to git

---

## VERIFICATION RESULTS

### What Was Verified ✅

1. **Phase 1 Forensic Audit**: Complete and published
   - Shared Core API architecture verified
   - No duplication of business logic found
   - Route ownership mapped
   - Web proxy pattern confirmed

2. **Code Changes Exist**: Phase 2 code modifications are present in working directory

3. **Interface Changes**: idempotencyKey field added to request contract (backward compatible)

4. **In-Memory Deduplication**: postCreationIdempotencyKeys Map implemented

5. **Media Ownership Checks**: Validation code added to createPost and updatePost

### What Was NOT Verified ❌

1. **Production Persistence**: Posts don't actually persist to Prisma (schema unused)

2. **Idempotency Key Lifecycle**: 
   - Flutter implementation is broken (new UUID per call, not per logical operation)
   - Web implementation generates new UUID per request (not suitable for retries)

3. **Media Status Validation**: No checks for FAILED/PROCESSING/DELETED status

4. **Database Constraints**: No Prisma foreign keys or unique constraints for idempotency

5. **Horizontal Scaling**: No verification of multi-instance behavior

6. **Automated Tests**: No tests written or executed

7. **Error Handling**: HTTP status codes and error messages not verified

---

## BLOCKING ISSUES IDENTIFIED

### Critical (Prevent Production Deployment)

1. **Post Persistence Missing**
   - Prisma schema exists but no code writes to it
   - Prisma/schema.prisma:386 states "nothing writes here in production"
   - All posts lost on server restart

2. **Flutter Idempotency Broken**
   - Generates new UUID every function call (posts_remote_ds.dart:376)
   - Retried request gets different key = duplicate post created
   - Violates idempotency contract

3. **Web Idempotency Incompatible with Retries**
   - api-client.ts generates UUID per POST request
   - Retry of same logical operation gets different key
   - Web's generic "all POST requests" approach doesn't work for create post

4. **In-Memory Storage Not Production-Grade**
   - In-memory Map lost on restart
   - No TTL = memory leak risk
   - Not shared across Node instances
   - No way to recover first response on duplicate

### High Priority (Required Before Production)

5. **Media Status Validation Missing**
   - No check for FAILED/PROCESSING media in createPost
   - No soft-delete check for media

6. **Prisma Integration Missing**
   - No idempotency table/column in schema
   - No foreign key from Post to Media in Prisma
   - No media ownership validation against persistent store

7. **Authorization Rule Location Incomplete**
   - whoCanComment documented but not consolidated to store layer
   - Deferred to Phase 3 (Prisma migration required)

---

## CURRENT ARCHITECTURE DECISION

**Preserved**: Shared Core API pattern
- No Web-specific BFF created ✅
- No Mobile-specific BFF created ✅
- Web remains thin proxy + UI ✅
- Flutter remains direct HTTP client ✅
- Domain logic stays in backend ✅

**NOT Preserved Yet**: Persistent storage
- Posts use in-memory store only
- Prisma tables defined but unused
- Requires Phase 3 implementation

---

## PRODUCTION READINESS VERDICT

🔴 **NOT PRODUCTION READY**

**Blockers**:
1. Post persistence not implemented (Prisma unused)
2. Idempotency broken in Flutter (UUID per call)
3. Idempotency incompatible with retries in Web (UUID per request)
4. In-memory storage lost on restart
5. Media validation doesn't apply to production path (posts don't persist)

**Can Deploy If**:
- Accept posts lost on restart (development only)
- Accept duplicate posts on network retry
- Understand Phase 2 provides no production durability

**Cannot Deploy For Production Until**:
- Phase 3: Implement Prisma post persistence
- Phase 3: Implement durable idempotency storage
- Phase 3: Fix idempotency key lifecycle (stable across retries)
- Phase 3: Test horizontal scaling
- Phase 3: Automated tests pass

---

## RECOMMENDED NEXT JOB

**Phase 3: Persistent Social Core — Post Vertical Slice**

Required:
1. Implement post persistence to Prisma (create/read/update/delete)
2. Implement PostMedia persistence with transaction safety
3. Implement durable idempotency storage (database or Redis)
4. Fix idempotency key lifecycle (stable logical operation keys)
5. Verify media ownership validation against Prisma
6. Verify authorization rules against Prisma data
7. Test horizontal scaling with multiple Node instances
8. Write and run comprehensive test suite

Estimated effort: TBD (after Phase 3A investigation and exact migration scope verification)

---

## HISTORICAL FACTS vs CURRENT STATE

### What Was Done (Phase 1)

- ✅ Forensic architecture audit completed
- ✅ Route ownership documented
- ✅ Duplication risks identified
- ✅ Current architecture validated as Shared Core API (no BFFs)

### What Was Attempted (Phase 2)

- ✅ Code changes added for idempotency tracking
- ✅ Code changes added for media ownership validation
- ✅ idempotencyKey field added to request contract
- ❌ Idempotency key lifecycle broken (new UUID per call)
- ❌ Persistence layer not implemented
- ❌ Tests not written

### What Was Discovered (Phase 2B)

- 🔴 Posts don't persist to Prisma (complete blocker)
- 🔴 Flutter idempotency implementation is broken
- 🔴 Web idempotency approach incompatible with retries
- 🔴 In-memory storage lost on restart
- 🔴 Prisma migration incomplete (not yet started)

---

## REPOSITORY STATE

**Current Branch**: HEAD (default/main)
**Uncommitted Changes**: Phase 2 implementation changes in working directory (NOT YET COMMITTED)
**Tests**: Not executed
**Production Status**: Development only (posts not persistent)

**Files with Uncommitted Changes**:
- `furtail_app_api/src/modules/social/social-store.ts` (idempotency, media validation)
- `furtail_app_api/src/routes/social.routes.ts` (extract idempotency key)
- `furtail_app/lib/features/posts/data/datasources/posts_remote_ds.dart` (send idempotency key ⚠️)

**Files NOT Changed**:
- Web client (already sends idempotency keys)
- Prisma schema (schema exists but unused)
- Any messaging/adoption/fundraising modules (preserved per constraints)

**Documentation Files Created** (for this status review):
- `docs/status/FURTAIL_SOCIAL_ARCHITECTURE_STATUS.md` (NEW)
- `docs/jobs/FURTAIL_PHASE_3_PERSISTENT_SOCIAL_CORE_JOB.md` (NEW)

---

## CONCLUSION

Phase 1 successfully completed. Phase 2 partially implemented with critical gaps discovered during Phase 2B verification. Current implementation does not achieve production readiness due to missing Prisma integration, broken idempotency key lifecycle, and in-memory storage limitations.

**Do not deploy Phase 2 to production.** Proceed to Phase 3 (Prisma migration) which is the required foundation.

**Last Review**: 2026-08-18
**Reviewed By**: Architecture Audit Process
**Status**: BLOCKED - Awaiting Phase 3 (Prisma migration)

