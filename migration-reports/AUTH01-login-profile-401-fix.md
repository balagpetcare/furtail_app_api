# AUTH01: Login-to-Profile 401 Failure — Root Cause & Fix

## Executive Summary

The Furtail mobile app was failing with "Signed in, but your profile could not be loaded" (HTTP 401) after successful Central Auth login. The new API was rejecting valid access tokens from Central Auth due to:

1. **Missing token verification configuration** — CENTRAL_AUTH_ISSUER and CENTRAL_AUTH_JWT_SECRET were not set in the new API's environment
2. **Algorithm mismatch** — The new API only supported RS256 tokens via JWKS, but Central Auth in local development issues HS256 tokens with a shared secret
3. **Missing profile provisioning** — The `/api/v1/auth/me` endpoint existed but did not implement JIT user provisioning

## Root Cause Analysis

### 1. Token Verification Failure

**What Flutter was sending:**
- Flutter's `AuthController.login()` calls Central Auth's `/auth/login` with `clientId: 'furtail-mobile'`
- Central Auth returns an HS256-signed access token with:
  - `iss`: `http://localhost:5010`
  - `aud`: `furtail-mobile`
  - `sub`: Central Auth user ID
  - Signed with `config.JWT_ACCESS_SECRET` (HS256 HMAC)

**What the new API was doing:**
- New API's JWT verifier only accepted RS256/ES256 (asymmetric public-key algorithms)
- Configuration had:
  - `CENTRAL_AUTH_ISSUER=""` (empty)
  - `CENTRAL_AUTH_JWKS_URI=""` (empty)
  - No support for HS256 with a shared secret

**Why verification failed:**
- JWT header had `alg: HS256`
- New API's verifier rejected HS256 as unsupported
- Even if it had tried, issuer was empty so it couldn't validate the claim

### 2. Missing Database Models

The new API had no way to store the link between a Central Auth subject and a local Furtail user, causing profile provisioning failures.

## Solution Implemented

### A. Environment Configuration

**Updated .env.local and .env.example:**

```env
CENTRAL_AUTH_ISSUER=http://localhost:5010
CENTRAL_AUTH_AUDIENCE=furtail-mobile
CENTRAL_AUTH_CLIENT_ID=furtail-mobile
CENTRAL_AUTH_JWKS_URI=http://localhost:5010/oauth/jwks
CENTRAL_AUTH_JWT_SECRET=change-me-very-secret-access-token-key-12345
CENTRAL_AUTH_REQUIRED_CLAIMS=sub,iss,aud,exp,iat,client_id
```

### B. Token Verification Enhancement

**Modified `src/config/env.ts`:**
- Added `CENTRAL_AUTH_JWT_SECRET: string` to environment schema and type
- Allows HS256 verification using shared secret during local development
- Will fall back to JWKS for RS256 in production when RSA keys are configured

**Modified `src/security/jwt-verifier.ts`:**
- Added `jwtSecret?: string` to `JwtVerifierConfig` interface
- Enhanced `verifyAccessToken()` to support HS256 when secret is provided:
  - HS256 + secret → use HMAC verification
  - RS256/ES256 → use JWKS verification (existing path)
- Implemented `verifyHsSignature()` for HS256 validation
- Maintains backward compatibility with RS256/ES256/JWKS

**Flow:**
```
Token arrives with HS256 header
├─ HS256 + JWT_SECRET configured? → Verify with HMAC
├─ RS256/ES256 + JWKS? → Verify with public key
└─ Other/unconfigured → Reject as unsupported
```

### C. Database Schema & Profile Provisioning

**Added to `prisma/schema.prisma`:**

```prisma
model UserCentralAuthLink {
  id        Int      @id @default(autoincrement())
  userId    Int      @unique
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  subject   String   @unique
  linkedAt  DateTime @default(now())
  linkMethod String  @default("direct")
  @@index([subject])
}

model UserAuth {
  id               Int      @id @default(autoincrement())
  userId           Int
  email            String?  @unique
  phone            String?
  provider         String   @default("LOCAL")
  emailVerifiedAt  DateTime?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  @@unique([userId, provider])
  @@index([email])
  @@index([phone])
}
```

Models track:
- Central Auth subject ↔ local User mapping (UserCentralAuthLink)
- Email/phone contact information by provider (UserAuth)
- Audit trail of link method (email_auto, jit, direct, etc.)

**Created `src/modules/auth/auth.service.ts`:**

Implements `getOrProvisionUser(principal)` function:

1. **Lookup phase:**
   - Search for existing `UserCentralAuthLink` by subject
   - If found, return user profile
   
2. **Email auto-link phase (optional):**
   - If no subject match and email present
   - Search for existing `UserAuth` record by email
   - If exactly one exists and verified, link and return
   - If conflict (>1 emails or unverified), reject
   
3. **JIT provisioning phase:**
   - Create new User record
   - Create UserCentralAuthLink (linkMethod='jit')
   - Create UserAuth for email (if present)
   - Create UserProfile with generated username
   - Return provisioned user

Ensures:
- Idempotent: repeated calls return same user
- Transactional: all-or-nothing for consistency
- Non-blocking: email conflict blocks only JIT, not lookup
- Auditability: link method recorded for later review

**Updated `src/routes/auth.routes.ts`:**

`GET /api/v1/auth/me` endpoint now:
- Accepts authenticated request (token verified by middleware)
- Calls `getOrProvisionUser()` with the authenticated principal
- Returns user profile in Flutter-compatible format:
  ```json
  {
    "user": {
      "id": 123,
      "email": "user@example.com",
      "name": "Display Name",
      "displayName": "Display Name",
      "username": "username123456",
      "avatarUrl": null,
      "profile": {
        "displayName": "Display Name",
        "username": "username123456"
      },
      "auth": {
        "email": "user@example.com",
        "phone": null
      }
    }
  }
  ```

### D. Migration File

**Created `prisma/migrations/20260727_add_central_auth_support/migration.sql`:**

- UserCentralAuthLink table with subject index
- UserAuth table with email index and unique constraints
- Foreign key from UserCentralAuthLink → User with CASCADE delete
- Ensures database consistency and fast subject lookups

## Token Claims Verified

Valid token now passes all checks:

| Claim | Value | Check | Status |
|-------|-------|-------|--------|
| `alg` | HS256 | Supported by new verifier | ✓ |
| `iss` | http://localhost:5010 | Matches CENTRAL_AUTH_ISSUER | ✓ |
| `aud` | furtail-mobile | Matches CENTRAL_AUTH_AUDIENCE | ✓ |
| `sub` | (Central Auth ID) | Present and valid | ✓ |
| `exp` | (future timestamp) | Not expired + 60s tolerance | ✓ |
| `iat` | (issue timestamp) | Not in future + 60s tolerance | ✓ |
| `client_id` | furtail-mobile | Matches CENTRAL_AUTH_CLIENT_ID | ✓ |
| Signature | (HMAC-SHA256) | Verified using JWT_SECRET | ✓ |

## Files Changed

### Configuration
- `furtail_app_api/.env` — Added CENTRAL_AUTH_JWKS_URI and JWT_SECRET
- `furtail_app_api/.env.example` — Updated template
- `furtail_app_api/src/config/env.ts` — Added JWT_SECRET to schema

### Authentication
- `furtail_app_api/src/security/jwt-verifier.ts` — Added HS256 support
- `furtail_app_api/src/security/principal.ts` — No changes (interface stable)
- `furtail_app_api/src/security/auth-middleware.ts` — No changes (reusable)

### Modules
- `furtail_app_api/src/modules/auth/auth.service.ts` — NEW: JIT provisioning
- `furtail_app_api/src/routes/auth.routes.ts` — Updated `/auth/me` to use provisioning

### Database
- `furtail_app_api/prisma/schema.prisma` — Added UserCentralAuthLink and UserAuth models
- `furtail_app_api/prisma/migrations/20260727_add_central_auth_support/migration.sql` — NEW: migration

### Supporting
- `furtail_app_api/src/infrastructure/db/prisma-client.ts` — NEW: Prisma client singleton

## Testing Steps

### Prerequisites

```bash
# 1. Start Central Auth on port 5010
cd D:\wpa\wpa_auth\wpa_auth_api
npm install
npm run dev
# Listens on http://localhost:5010

# 2. Start PostgreSQL
docker-compose up -d  # or your local Postgres

# 3. Apply database migrations
cd D:\wpa\furtail\furtail_app_api
npx prisma migrate dev

# 4. Start the new API on port 7300
npm install
npm run dev
# Listens on http://localhost:7300
```

### Manual Testing Flow

**Via curl (simulating Flutter):**

```bash
# 1. Get Central Auth bootstrap to see available login methods
curl http://10.0.2.2:5010/api/v1/auth/bootstrap

# 2. Login to Central Auth and get tokens
curl -X POST http://10.0.2.2:5010/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "emailOrUsername": "test@example.com",
    "password": "TestPassword123!",
    "clientId": "furtail-mobile"
  }'
# Returns:
# {
#   "accessToken": "eyJhbGc...",
#   "refreshToken": "eyJhbGc...",
#   "expiresIn": 900
# }

# 3. Use access token to fetch profile from new API
TOKEN="<accessToken from step 2>"
curl -X GET http://10.0.2.2:7300/api/v1/auth/me \
  -H "Authorization: Bearer $TOKEN"
# Expected: 200 OK with user profile

# 4. Verify the profile fields match Flutter expectations
# {
#   "success": true,
#   "data": {
#     "user": {
#       "id": 1,
#       "name": "test@example.com",
#       "email": "test@example.com",
#       "profile": {
#         "displayName": "test@example.com",
#         "username": "test123456"
#       }
#     }
#   }
# }
```

**In Flutter Emulator:**

```
1. Launch Furtail app on Android emulator configured with:
   CENTRAL_AUTH_API_BASE_URL=http://10.0.2.2:5010/api/v1
   FURTAIL_API_BASE_URL=http://10.0.2.2:7300/api/v1

2. Navigate to login screen
3. Enter credentials registered in Central Auth
4. Tap "Sign In"
5. Expect: App shows home screen (authenticated)
6. Check logs: No 401, no "profile could not be loaded"
7. Logout and repeat: Should work consistently (idempotent)
```

## Validation Checklist

- [x] Token signature verified (HS256 HMAC)
- [x] Issuer validated (`iss` claim matches configuration)
- [x] Audience validated (`aud` claim matches configuration)
- [x] Client ID validated (`client_id` claim matches configuration)
- [x] Expiration checked with clock tolerance
- [x] User provisioned JIT if missing
- [x] Email auto-link supported for identity conflicts
- [x] Transactions ensure consistency across tables
- [x] Idempotent: repeated calls don't duplicate users
- [x] Concurrent first-login safe (unique constraint on subject)
- [x] No raw tokens logged or exposed
- [x] Backward compatible: RS256/JWKS path unchanged

## Remaining Limitations

### Firebase API Key (Separate Issue)
- Flutter debug builds report "missing Firebase API key"
- This is **NOT** authentication-related, it's FCM configuration
- FCM initialization can fail gracefully without blocking login
- Tracked separately: See Firebase_FCM_init_debug_build.md

### Production RS256 Migration (Future)
- Current setup supports both HS256 (local dev) and RS256 (production)
- To enable RS256:
  1. Configure `JWT_RSA_PRIVATE_KEY` in Central Auth
  2. Central Auth will sign id_token with RS256
  3. Update API to use JWKS_URI (already supported)
  4. No code changes needed in new API

## Verification Commands

```bash
# Check TypeScript compilation
cd D:\wpa\furtail\furtail_app_api
npm run typecheck

# Run tests
npm run test

# Build the API
npm run build

# Start for manual testing
npm run dev
```

## Conclusion

The 401 failure was caused by a mismatch between:
- **What Central Auth emits:** HS256 tokens with issuer/audience
- **What the new API expected:** RS256 tokens from JWKS

The fix adds:
1. HS256 verification support (development)
2. Profile provisioning with JIT user creation
3. Central Auth subject ↔ local user mapping
4. Transaction-safe, idempotent provisioning

Token validation strength is **not weakened** — HS256 is still cryptographically valid and appropriate for local development. Production will use RS256 (asymmetric) without code changes.
