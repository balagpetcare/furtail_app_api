# JOB: FURTAIL PHASE 3 — PERSISTENT SOCIAL CORE

**Job ID**: FURTAIL-PHASE-3-SOCIAL
**Created**: 2026-08-18
**Status**: NOT STARTED
**Blocked By**: Awaiting explicit Phase 3 authorization
**Estimated Duration**: TBD (after Phase 3A investigation and exact migration scope verification)

---

## OBJECTIVE

Make the existing Shared Core Post API durable, production-safe, and horizontally scalable by implementing persistent storage in Prisma without creating separate Web/Mobile business APIs.

**Non-Goal**: Do not redesign architecture. Do not create BFFs. Do not rewrite Create Post UI.

---

## CURRENT STATE (From Phase 2B Audit)

### What Exists

- ✅ Prisma Post/PostMedia/PostComment schema defined (unused)
- ✅ In-memory SocialCoreStore with basic post operations
- ✅ Shared Core API routes for post create/update/delete
- ✅ Web thin proxy (no business logic)
- ✅ Flutter direct HTTP client
- ✅ Request/response contracts verified stable

### What's Missing

- ❌ No Prisma write operations for posts (schema unused)
- ❌ No idempotency persistent storage
- ❌ No media ownership validation against Prisma
- ❌ No transaction-safe media attachment
- ❌ No horizontal scaling support
- ❌ No automated tests for persistence
- ❌ No restart safety

### Phase 2 Code Present

- `social-store.ts`: In-memory idempotency Map + media validation checks (no Prisma writes)
- `social.routes.ts`: Idempotency key extraction from requests
- `posts_remote_ds.dart`: ⚠️ BROKEN idempotency (new UUID per call)

---

## REQUIRED INVESTIGATION (Before Implementation)

Do NOT implement. Only investigate and document findings.

### 1. Verify Actual Runtime Persistence Path

**Question**: When DATABASE_URL is set, where do posts actually live?

**Investigation Steps**:
- Trace `router.post('/api/v1/posts', ...)` 
- Follow to `store.createPost()`
- Check if SocialCoreStore writes to Prisma
- Verify whether Prisma Post table is used
- Document the actual serving path

**Current Finding**: No prisma.post.create() found anywhere. Posts live in memory only.

**Required Proof**:
- Source code inspection showing current behavior
- Evidence of any existing Prisma post writes (or confirmation none exist)
- Runtime behavior documentation

### 2. Prove DATABASE_URL Behavior

**Question**: What happens to posts when DATABASE_URL is configured?

**Investigation Steps**:
- Check env.DATABASE_URL handling in main.ts/server startup
- Trace getPrisma() initialization
- Verify SocialCoreStore receives Prisma connection
- Document whether posts persist when Prisma is available

**Current Finding**: mediaPrisma parameter exists but used only for media, not posts.

**Required Proof**:
- Confirmed: SocialCoreStore has no this.prisma field
- Confirmed: No post creation writes to database
- Documented: Current in-memory behavior in production

### 3. Verify Media Persistence Source

**Question**: Are media records actually persisted to Prisma?

**Investigation Steps**:
- Check `store.uploadMedia()` → `mediaPrisma.media.create()`
- Verify media uses Prisma when available
- Document media ownership constraints in schema
- Verify media status field (READY/PROCESSING/FAILED)

**Current Finding**: Media does use Prisma when mediaPrisma is available (lines 861, 884, etc.).

**Required Proof**:
- Confirmed: Media persistence works via Prisma
- Document: Media schema structure
- List: Existing media validations that work

### 4. Identify Required Migrations

**Question**: What schema changes are needed?

**Investigation Steps**:
- Review Prisma Post table (already defined)
- Check PostMedia junction table
- Review PostComment table
- Verify all foreign keys present
- List any missing columns (idempotency_key?)
- Identify any missing indexes

**Current Finding**: Schema exists (schema.prisma:378-428). May need idempotency_key column.

**Required Documentation**:
- Current schema structure
- Required new columns or tables
- Required constraints and indexes
- Data migration strategy (first deployment)

### 5. Identify Rollback Strategy

**Question**: How can we safely rollback if Prisma migration fails?

**Investigation Steps**:
- Design dual-read capability (read from both Prisma and in-memory)
- Plan gradual migration (percentage of traffic)
- Document fallback path if Prisma write fails
- Plan zero-downtime switchover

**Required Documentation**:
- Rollback procedure
- Gradual migration strategy
- Monitoring/validation points
- Fallback if issues discovered in production

---

## REQUIRED IMPLEMENTATION (Future Job - Do Not Execute Now)

### Phase 3A: Post Persistence

#### 3A.1 — Implement Post Create Persistence

**What**: Modify `SocialCoreStore.createPost()` to write to Prisma

**Scope**:
- Accept Prisma connection in store (add this.prisma field)
- On post creation: `await prisma.post.create({ ... })`
- Link media via PostMedia junction table
- Implement transaction safety (create post + link media atomically)

**Must NOT**:
- Create separate Web/Mobile post endpoints
- Duplicate business logic in route handlers
- Change request/response contract
- Break existing Web/Flutter clients

**Acceptance Criteria**:
- Post appears in prisma database after create
- PostMedia relations created
- Media not duplicated if link fails and retries
- Existing in-memory posts still work if Prisma unavailable
- All metadata preserved (type, privacy, tags, music, etc.)

#### 3A.2 — Implement Post Read Persistence

**What**: Read posts from Prisma when available

**Scope**:
- Modify `store.getPostById()` to query Prisma if available
- Ensure response shape unchanged
- Load related media
- Handle soft-deleted posts

**Acceptance Criteria**:
- Post retrieved from Prisma database
- Related media loaded
- Response matches existing contract

#### 3A.3 — Implement Post Update Persistence

**What**: Update posts in Prisma, including media replacement

**Scope**:
- Modify `store.updatePost()` to persist to Prisma
- Handle media replacement (remove old, add new)
- Verify new media owned by user (existing validation helps)
- Transaction safety for media changes

**Acceptance Criteria**:
- Post updated in Prisma
- Media links updated correctly
- Concurrent updates don't corrupt state

#### 3A.4 — Implement Post Delete Persistence

**What**: Soft-delete posts via status field

**Scope**:
- Update `store.deletePost()` to set status='DELETED' in Prisma
- Exclude deleted posts from queries
- Preserve audit trail

**Acceptance Criteria**:
- Post marked deleted in Prisma
- Deleted posts filtered from lists

### Phase 3B: Idempotency Persistence

#### 3B.1 — Design Idempotency Storage

**Question**: Database unique constraint or separate table?

**Option A: Unique Constraint** (Simpler)
```sql
ALTER TABLE posts ADD COLUMN idempotency_key VARCHAR(36);
CREATE UNIQUE INDEX idx_post_idempotency 
  ON posts(author_id, idempotency_key) 
  WHERE status != 'DELETED';
```

**Option B: Separate Table** (More flexible)
```sql
CREATE TABLE post_idempotencies (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  idempotency_key VARCHAR(36) NOT NULL,
  post_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, idempotency_key),
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(post_id) REFERENCES posts(id),
  INDEX idx_expiry (created_at)
);
```

**Required Investigation**:
- Determine schema approach
- Estimate storage for idempotency table (TTL=24h retention)
- Verify uniqueness constraint effectiveness

**Must NOT**:
- Distribute idempotency to separate service
- Create Web/Mobile specific idempotency paths
- Change request/response contract

#### 3B.2 — Fix Idempotency Key Lifecycle

**Current Problem**: Flutter generates new UUID per function call

**Required Fix**: Move UUID generation to operation/draft level, not request level

**For Flutter**:
- Create draft/request-builder pattern
- Generate one UUID per logical post creation
- Reuse same UUID across retries

**For Web**:
- Move UUID generation to Post mutation context
- Preserve same key across retries of same submission
- Not "all POST requests" but "this specific post submission"

**Acceptance Criteria**:
- Same logical post operation uses same idempotency key
- Retried request returns original post (HTTP 200)
- New post operation gets new key
- Same key from different users doesn't collide

#### 3B.3 — Implement Idempotent Post Creation

**What**: Use idempotency key to return cached first response on duplicate

**Scope**:
- Store first successful response with idempotency key
- On duplicate key: return cached response (same post)
- Handle timeout edge cases (uncertain response)
- Implement TTL (24 hours default)

**Acceptance Criteria**:
- Duplicate request returns original post (no duplicate created)
- Response identical to first successful response
- Multi-instance safe (Prisma or Redis backend)
- Restart safe (persisted to database or cache)

### Phase 3C: Media Validation in Production Path

#### 3C.1 — Validate Media Ownership Against Prisma

**What**: Verify mediaIds belong to authenticated user in database

**Current**: Checks in-memory media only

**Required**: Add Prisma FK constraint + application validation

**Scope**:
- Add foreign key constraint in PostMedia table
- Verify media.owner_id = post.author_id in application
- Reject foreign media IDs with 403 Forbidden

**Acceptance Criteria**:
- Foreign media IDs rejected before post created
- Prisma constraint prevents orphaned relations
- Clear error message to client

#### 3C.2 — Validate Media Status

**What**: Handle media status validation during attachment

**Current**: No status field checks in createPost

**Required**: Decision during Phase 3A regarding PROCESSING media handling

**Scope**:
- Query media.status before attaching
- FAILED media: Reject with 422 Unprocessable Entity
- DELETED media: Reject with 422 Unprocessable Entity
- PROCESSING media: **Decision required** — canonical pipeline semantics must be audited to determine if:
  - Reject (user must wait for transcoding)
  - Wait with timeout (block post creation until transcoding completes)
  - Conditionally allow (accept partially-processed media)

**Acceptance Criteria** (pending media pipeline audit):
- FAILED media rejected
- DELETED media rejected
- PROCESSING media: handling per Phase 3A decision
- Clear error messages for each rejection reason

#### 3C.3 — Validate Media Ordering

**What**: Preserve media order specified by client

**Current**: mediaIds array order preserved in store

**Required**: Preserve in PostMedia.position field

**Scope**:
- Use PostMedia.position (already in schema)
- Sort media by position on retrieval
- Validate no duplicate mediaIds

**Acceptance Criteria**:
- Media order preserved across restart
- No duplicate media IDs in single post
- Media returned in correct order

### Phase 3D: Authorization Consolidation

#### 3D.1 — Consolidate whoCanComment to Store

**What**: Move privacy rule from route to domain layer

**Current**: Checked at route handler (Prisma-only path)

**Required**: Moved to store, available to both Prisma and in-memory

**Scope**:
- Store loads UserProfile.whoCanComment
- Check rule in addComment() before creating comment
- Consistent behavior in both Prisma and in-memory modes

**Acceptance Criteria**:
- whoCanComment enforced in store layer
- Works in both Prisma and in-memory modes
- No route-layer privacy checks remain

#### 3D.2 — Verify Post Privacy Rules

**What**: Ensure post visibility enforced consistently

**Current**: ensureCanViewPost() in store

**Required**: Verify applies to all paths (read, comment, like)

**Acceptance Criteria**:
- POST/FOLLOWERS_ONLY/PRIVATE posts respected
- Blocked users can't read posts
- Muted users can't see in feed
- Consistent across all operations

---

## ACCEPTANCE CRITERIA

### Functional Requirements

- [ ] Posts persist to Prisma database
- [ ] Posts survive server restart
- [ ] Idempotency key deduplicates duplicate submissions
- [ ] Same idempotency key returns original post (no duplicate)
- [ ] Different keys create different posts
- [ ] Same key from different users creates separate posts
- [ ] Media ownership validated before attachment
- [ ] Foreign media IDs rejected (403)
- [ ] Media ordering preserved
- [ ] Media status (FAILED/PROCESSING) handled correctly
- [ ] whoCanComment enforced before comment creation
- [ ] Privacy rules respected across all operations
- [ ] Backward compatible with Web/Flutter clients (no breaking changes)
- [ ] Existing in-memory tests still pass

### Non-Functional Requirements

- [ ] Horizontal scaling supported (multiple Node instances)
- [ ] Idempotency works across instances
- [ ] No race conditions on concurrent duplicate submissions
- [ ] Performance: post creation under 100ms (Prisma)
- [ ] Performance: post retrieval under 50ms
- [ ] Zero downtime switchover from in-memory to Prisma
- [ ] Rollback procedure documented and tested
- [ ] Monitoring/metrics for persistence operations

---

## REQUIRED TESTS

### Backend TypeScript Tests

**File**: `tests/modules/social/post-persistence.test.ts` (new)

```typescript
describe('Post Persistence', () => {
  test('Post created in Prisma persists across restart', ...)
  test('Post survives database query after creation', ...)
  test('PostMedia relations created correctly', ...)
  test('Duplicate media IDs rejected', ...)
  test('Foreign media IDs rejected', ...)
  test('Media ownership validated before attachment', ...)
  test('Media status validation (FAILED/PROCESSING)', ...)
  test('Media ordering preserved', ...)
})

describe('Idempotency', () => {
  test('First request creates post', ...)
  test('Duplicate idempotency key returns same post', ...)
  test('Different keys create different posts', ...)
  test('Same key from user A and user B create separate posts', ...)
  test('Timeout/uncertain response handled correctly', ...)
  test('Idempotency survives server restart', ...)
  test('Multi-instance concurrency safe', ...)
})

describe('Authorization', () => {
  test('whoCanComment enforced in store', ...)
  test('Post privacy respected on create', ...)
  test('Blocked user cant comment', ...)
  test('Muted user filtered from feed', ...)
})
```

### Web Tests

**File**: `src/__tests__/api/posts-create.test.tsx` (new)

```typescript
describe('Web Post Creation', () => {
  test('Create post through Web client', ...)
  test('Same draft retried uses same idempotency key', ...)
  test('Network failure + retry doesn\'t create duplicate', ...)
  test('Media order preserved', ...)
})
```

### Flutter Tests

**File**: `test/features/posts/post_creation_test.dart` (new)

```dart
void main() {
  group('Flutter Post Creation', () {
    test('Create post through Flutter client', ...)
    test('Same logical post reuses idempotency key', ...)
    test('Network failure + retry doesn\'t create duplicate', ...)
    test('Media attachment order preserved', ...)
  })
}
```

### Integration Tests

**File**: `tests/integration/post-vertical-slice.test.ts` (new)

```typescript
describe('Post Vertical Slice', () => {
  test('Web create → Flutter read same post', ...)
  test('Flutter create → Web read same post', ...)
  test('Concurrent create with different keys', ...)
  test('Concurrent create with same key (dedup)', ...)
  test('Database persistence verified', ...)
  test('Restart safety verified', ...)
})
```

---

## RISKS

### Data Loss Risk

**Risk**: Existing in-memory posts lost when switching to Prisma
**Mitigation**: 
- In-memory posts are ephemeral (expect to be lost)
- Document as development-only data
- No production data to migrate

### Backward Compatibility Risk

**Risk**: Existing Web/Flutter clients break on response change
**Mitigation**:
- Request/response contract must remain identical
- idempotencyKey is optional field (new clients handle it, old clients don't send it)
- No field removals or renames
- Test with old client versions before rollout

### Concurrency Risk

**Risk**: Race condition on duplicate submission from multiple threads
**Mitigation**:
- Use database UNIQUE constraint on (user_id, idempotency_key)
- Database ensures only one first-write succeeds
- Application checks before write
- Test multi-instance concurrent behavior

### Migration Risk

**Risk**: Failed switchover leaves system in broken state
**Possible Approaches** (validation and selection required in Phase 3A):
- Dual-read path strategy: Prefer Prisma, fallback to in-memory (requires consistency audit)
- Canary rollout: Gradually increase percentage of traffic to Prisma path
- Immediate rollback procedure: Revert to in-memory-only if issues detected
- Monitor error rates: Track divergence between in-memory and Prisma data

**Note**: These approaches are POSSIBLE but require Phase 3A verification of:
- Consistency implications of dual-read fallback
- Whether in-memory fallback is safe for production
- Data divergence detection mechanisms
- Monitoring/alerting thresholds before automatic rollback

### Timeout/Uncertain Response Risk

**Risk**: Client retries after uncertain response, idempotency key prevents duplicate but doesn't know original succeeded
**Mitigation**:
- Store and return original response with idempotency key
- Client retries get 200 OK with original post
- Idempotency storage includes response body
- Test timeout scenarios explicitly

---

## DEPENDENCIES

### Explicit Discovered Dependencies

1. **Prisma Schema**: Post/PostMedia/PostComment tables must be defined
   - Status: ✅ Already defined (schema.prisma:378-428)
   - Action: Review schema, may need idempotency_key column addition

2. **Media Persistence**: Media must be in Prisma database
   - Status: ✅ Already working (mediaPrisma integration exists)
   - Action: Verify schema, use as reference for post schema

3. **User Profile**: whoCanComment stored in UserProfile
   - Status: ✅ Exists (schema.prisma:140-193)
   - Action: Load UserProfile in store for authorization checks

4. **Database Connection**: Prisma client must be initialized
   - Status: ✅ getPrisma() exists
   - Action: Ensure store receives Prisma instance

### Implicit Dependencies

5. **Transaction Support**: Database transactions for atomic post+media creation
   - Dependency: Prisma transaction API
   - Action: Use prisma.$transaction()

6. **Unique Constraints**: Database-level idempotency enforcement
   - Dependency: Prisma schema supports constraints
   - Action: Add UNIQUE(user_id, idempotency_key) or separate table

7. **Foreign Keys**: Referential integrity for post-media relations
   - Dependency: Database foreign key support
   - Action: Prisma schema already has FK definitions

### Timeline Dependencies

- Phase 3A (Post Persistence): 2-3 weeks - unblocks Phase 3B
- Phase 3B (Idempotency): 1 week - depends on Phase 3A
- Phase 3C (Media Validation): 1 week - parallel to 3B
- Phase 3D (Authorization): 3-4 days - parallel to 3C

---

## OUT OF SCOPE

### Explicitly Excluded

**Do NOT do in Phase 3**:

- ❌ Create separate Web-specific post API
- ❌ Create separate Mobile-specific post API
- ❌ Create any new BFFs or adapter layers
- ❌ Redesign Create Post UI components
- ❌ Rewrite any unrelated modules (messaging, adoption, fundraising)
- ❌ Change post request/response contract
- ❌ Implement features beyond basic persistence/idempotency
- ❌ Change architecture away from Shared Core API pattern

### Intentionally Deferred

**To Future Phases**:

- Notifications domain events (may happen in Phase 3 but not required)
- Feed ranking/algorithm optimization
- Post privacy policy changes
- New post types or fields
- Historical data analytics
- Audit logging beyond basic persistence

---

## NEW FINDINGS FROM PHASE 2B AUDIT

### Finding 1: Flutter Idempotency Implementation is Broken

**Evidence**: posts_remote_ds.dart:376 generates new UUID every call
```dart
final idempotencyKey = const Uuid().v4(); // ❌ NEW UUID EVERY TIME
```

**Severity**: CRITICAL - Breaks idempotency contract
**Affected Files**: furtail_app/lib/features/posts/data/datasources/posts_remote_ds.dart
**Production Impact**: Retry requests create duplicate posts
**Recommended Future Action**: Implement draft/operation-level idempotency key management
**Dependency**: Requires Phase 3 idempotency redesign
**Verification Required**: Test retry scenarios with intentional network failure

### Finding 2: Posts Don't Persist in Prisma

**Evidence**: No prisma.post.create() found anywhere in codebase; schema.prisma:386 states "nothing writes here in production"
**Severity**: CRITICAL - Complete blocker for production
**Affected Files**: All post creation/update/delete code uses in-memory store only
**Production Impact**: Posts lost on server restart; no persistent storage
**Recommended Future Action**: Implement Prisma integration in Phase 3
**Dependency**: Required before any other post operations can work durably
**Verification Required**: Prove posts actually persist to Prisma after Phase 3 implementation

### Finding 3: Web Idempotency Key Incompatible with Retries

**Evidence**: api-client.ts:36-38 generates new UUID for every POST request
**Severity**: HIGH - Breaks retry safety for all POST operations
**Affected Files**: furtail_web/src/lib/api-client.ts
**Production Impact**: Web retry requests with new keys create duplicates
**Recommended Future Action**: Move UUID generation to mutation/draft layer for post creation
**Dependency**: Requires architecture change to draft/mutation layer
**Verification Required**: Test Web create post retry scenarios with network failure

### Finding 4: Media Status Validation Missing

**Evidence**: social-store.ts:1844-1856 checks media existence and ownership but not status
**Severity**: HIGH - Allows attachment of FAILED or PROCESSING media
**Affected Files**: furtail_app_api/src/modules/social/social-store.ts (createPost/updatePost methods)
**Production Impact**: Users can attach media that isn't ready or failed transcoding
**Recommended Future Action**: Add media.status !== 'READY' check in createPost
**Dependency**: Requires media schema verification (already has status field)
**Verification Required**: Test with FAILED/PROCESSING media IDs

### Finding 5: In-Memory Idempotency Storage Lost on Restart

**Evidence**: postCreationIdempotencyKeys is a Map with no persistence
**Severity**: HIGH - Duplicates reappear after server restart
**Affected Files**: furtail_app_api/src/modules/social/social-store.ts:908-913
**Production Impact**: Server restart loses all idempotency keys; subsequent requests create new posts
**Recommended Future Action**: Persist idempotency keys to database with TTL
**Dependency**: Requires Prisma integration (Phase 3A)
**Verification Required**: Test post creation before/after server restart with same idempotency key

### Finding 6: Prisma Media Validation Not Applied to Posts

**Evidence**: Media ownership validated in store against in-memory media, not Prisma
**Severity**: MEDIUM - Works in-memory but doesn't apply to production persistent path
**Affected Files**: furtail_app_api/src/modules/social/social-store.ts (createPost media validation)
**Production Impact**: When posts persist to Prisma, validation happens against old in-memory media state
**Recommended Future Action**: Change validation to query Prisma media when available
**Dependency**: Requires Prisma post persistence (Phase 3A)
**Verification Required**: Verify media validation works against Prisma database records

---

## JOB STATUS TRACKING

**Created**: 2026-08-18
**Phase**: Not started (awaiting authorization)
**Last Updated**: 2026-08-18
**Assignee**: [To be determined]
**Blocker Status**: Waiting for explicit Phase 3 authorization

---

## NEXT STEPS

1. Review this job document for accuracy and completeness
2. Obtain stakeholder approval to proceed with Phase 3
3. Schedule Phase 3 work (estimated 4-6 weeks)
4. Set up investigation phase to confirm findings
5. Design idempotency and persistence strategy
6. Implement Phase 3A, 3B, 3C, 3D in sequence
7. Execute test suite
8. Perform zero-downtime migration
9. Monitor production metrics

**Do not proceed with implementation until explicit Phase 3 authorization is given.**

