# Step 13 — Production Cutover Checklist

**Date:** 2026-07-26  
**Purpose:** Verify all prerequisites before production deployment  
**Status:** Ready for Step 14 (Cutover Plan)

---

## Pre-Deployment Verification Checklist

### ✅ Code Quality (VERIFIED)
- [x] TypeScript type checking passes (`npm run typecheck`)
- [x] ESLint linting passes (`npm run lint`)
- [x] Prettier formatting passes (`npm run format:check`)
- [x] All Jest tests pass (`npm run test` — 56/56)
- [x] Code coverage at acceptable baseline (60.89%)
- [x] Production build succeeds (`npm run build`)
- [x] No `console.log` or debug code remains
- [x] No commented-out code blocks

### ✅ Dependency Management (VERIFIED)
- [x] Node 24 engine requirement enforced
- [x] npm 11 engine requirement enforced
- [x] npm audit shows 0 vulnerabilities
- [x] No obsolete dependencies
- [x] Only one lockfile present (package-lock.json)
- [x] Lockfile is up-to-date with package.json

### ✅ Database & Migrations (VERIFIED)
- [x] Prisma schema validated successfully
- [x] Initial migration created (20260726173016_init)
- [x] Migration can be applied from empty database
- [x] Migration can be deployed idempotently
- [x] All required models defined:
  - [x] User (core identity)
  - [x] UserProfile (profile data)
  - [x] Wallet (payments & points)
  - [x] Media (file storage)
  - [x] Post (social feed)
  - [x] PostComment (discussions)
  - [x] PostLike, PostBookmark, PostView, PostShare
  - [x] PostCommentLike
  - [x] UserFollow (relationships)
  - [x] UserProfileLike (profile reactions)
  - [x] UserBlock (blocking)
  - [x] FriendRequest (friend management)
- [x] Decimal(18,2) used for money fields
- [x] All necessary indexes/constraints in place

### ✅ Security (VERIFIED)
- [x] No secrets committed to git
- [x] .env files in .gitignore
- [x] No hardcoded credentials anywhere
- [x] JWT verification middleware in place
- [x] Rate limiting implemented
- [x] CORS configured (helm middleware)
- [x] Input validation via Zod schemas
- [x] Error messages don't leak system details
- [x] Database passwords/keys not in code

### ✅ Configuration (VERIFIED)
- [x] Environment template (.env.example) complete
- [x] All required env vars documented
- [x] Safe defaults for development mode
- [x] Production env vars can be externally injected
- [x] No hardcoded environment assumptions
- [x] Service name & version configurable

### ✅ API Endpoints (VERIFIED)
- [x] Health probe at `/health`
- [x] Readiness probe at `/ready`
- [x] Version endpoint at `/api/v1/version`
- [x] 151 endpoints documented in endpoint matrix
- [x] All documented endpoints implemented
- [x] Request/response formats validated
- [x] Error codes documented
- [x] Pagination implemented where needed

### ✅ Legacy System (VERIFIED)
- [x] No unintended changes to legacy API
- [x] Legacy API can run independently
- [x] No shared database between old/new API
- [x] Data migration path clear (Step 14)
- [x] Rollback possible (API can point back to legacy)

### ✅ Flutter Integration (VERIFIED)
- [x] Configuration for new API implemented
- [x] Configuration for rollback implemented
- [x] Environment files in place (new-api-emulator.json, rollback-7200.json)
- [x] API base URL configurable
- [x] Socket URL configurable (for future)
- [x] Media base URL configurable
- [x] Cutover tests define expected behavior

### ✅ Documentation (VERIFIED)
- [x] API documentation complete
- [x] Migration strategy documented
- [x] Rollback procedure documented
- [x] Endpoint matrix created
- [x] Data ownership map created
- [x] Configuration guide available

---

## Pre-Production Setup Checklist

### 🔴 REQUIRED: Central Auth Service Setup
**Status:** ⚠️ PENDING (external service)

**Prerequisites:**
- [ ] Central Auth service endpoint URL available
- [ ] OAuth issuer URL configured
- [ ] JWKS endpoint accessible
- [ ] Audience identifier registered
- [ ] JWT verification tested

**Steps:**
1. Obtain `CENTRAL_AUTH_ISSUER` from ops
2. Obtain `CENTRAL_AUTH_JWKS_URI` from ops
3. Set `CENTRAL_AUTH_AUDIENCE=furtail-mobile`
4. Create test user in Central Auth
5. Verify token exchange flow locally
6. Add integration test for JWT validation

**Configuration Variables:**
```
CENTRAL_AUTH_ISSUER=https://auth.example.com/
CENTRAL_AUTH_JWKS_URI=https://auth.example.com/.well-known/jwks.json
CENTRAL_AUTH_AUDIENCE=furtail-mobile
CENTRAL_AUTH_CLIENT_ID=furtail-mobile
CENTRAL_AUTH_REQUIRED_CLAIMS=sub,iss,aud,exp,iat,client_id
```

**Testing:**
- [ ] Obtain valid JWT from Central Auth
- [ ] Call `/api/v1/auth/me` with JWT
- [ ] Verify user is created/authenticated
- [ ] Verify invalid JWT is rejected
- [ ] Verify expired JWT is rejected

---

### 🟡 OPTIONAL: Payment Processing Setup
**Status:** 🟡 DEFERRED (not required for MVP)

**If Implementing:**
1. [ ] Choose payment provider (Stripe, PayPal, etc.)
2. [ ] Create merchant account
3. [ ] Obtain API keys
4. [ ] Implement webhook handlers
5. [ ] Set up refund flow
6. [ ] Test charge → refund cycle
7. [ ] Add PCI-DSS compliance review

**Configuration Variables:**
```
PAYMENT_PROVIDER=stripe  # or paypal, etc
PAYMENT_API_KEY=sk_live_xxx
PAYMENT_WEBHOOK_SECRET=whsec_xxx
```

---

### 🟡 OPTIONAL: Media Processing Setup
**Status:** 🟡 DEFERRED (required for full feature, not MVP)

**If Implementing:**
1. [ ] Choose media service (S3, Cloudinary, Mux)
2. [ ] Create service account
3. [ ] Obtain API credentials
4. [ ] Configure upload bucket
5. [ ] Set up CDN/distribution
6. [ ] Implement media processing workers
7. [ ] Test upload → process → serve flow

**Configuration Variables:**
```
MEDIA_STORAGE_TYPE=s3  # or cloudinary, gcs, etc
MEDIA_STORAGE_BUCKET=furtail-media-prod
MEDIA_STORAGE_REGION=us-east-1
MEDIA_STORAGE_KEY=xxx
MEDIA_STORAGE_SECRET=xxx
```

---

### 🟡 OPTIONAL: Email Notifications Setup
**Status:** 🟡 DEFERRED (nice-to-have for MVP)

**If Implementing:**
1. [ ] Choose email provider (SendGrid, AWS SES)
2. [ ] Create service account
3. [ ] Obtain API credentials
4. [ ] Configure sender domain (SPF/DKIM)
5. [ ] Implement email templates
6. [ ] Test email delivery
7. [ ] Set up bounce/complaint handling

**Configuration Variables:**
```
EMAIL_PROVIDER=sendgrid  # or aws-ses, etc
EMAIL_API_KEY=SG.xxx
EMAIL_FROM_ADDRESS=noreply@furtail.world
REDIS_ENABLED=true
REDIS_HOST=redis-prod
REDIS_PORT=6379
```

---

## Deployment Environment Checklist

### Infrastructure Requirements

**PostgreSQL Database:**
- [ ] Version 14+ (tested on 16)
- [ ] Port 5432 open to application
- [ ] SSL/TLS for production
- [ ] Daily backups enabled
- [ ] Point-in-time recovery enabled
- [ ] Master-replica replication (high availability)
- [ ] Connection pooling configured (e.g., PgBouncer)

**Suggested Specs:**
```
- Instance: AWS RDS db.m6i.large or equivalent
- Storage: 100GB+ gp3 SSD
- Backup: Daily, 30-day retention
- Multi-AZ: Yes (automatic failover)
```

**Redis (Optional, for rate limiting and caching):**
- [ ] Version 6+ (optional for MVP)
- [ ] Port 6379 open to application
- [ ] Memory: 1GB+ recommended
- [ ] Eviction policy: allkeys-lru

**Application Server:**
- [ ] Node.js 24.18.0+
- [ ] CPU: 2+ cores
- [ ] RAM: 2GB+ (adjust based on load)
- [ ] Disk: 20GB+ for logs/temp
- [ ] Network: 100Mbps+ bandwidth

**Load Balancer:**
- [ ] Health check endpoint: `/health`
- [ ] Readiness check endpoint: `/ready`
- [ ] Health check interval: 10 seconds
- [ ] Timeout: 5 seconds
- [ ] Unhealthy threshold: 2 consecutive failures

---

### Network & Routing

**DNS Configuration:**
- [ ] API domain points to load balancer
- [ ] HTTPS certificate installed
- [ ] Certificate auto-renewal configured
- [ ] CORS origins whitelist includes Flutter app domain

**Firewall Rules:**
- [ ] Port 7300 (or configured PORT) open to load balancer
- [ ] Database port 5432 accessible from app servers
- [ ] Redis port 6379 accessible from app servers
- [ ] Outbound HTTPS for external services (Central Auth, etc)

---

### Environment Variables for Production

**Required (No Defaults):**
```bash
DATABASE_URL=postgresql://user:pass@host:5432/furtail_prod
NODE_ENV=production
PORT=7300
SERVICE_NAME=furtail-app-api
SERVICE_VERSION=0.1.0
```

**Authentication (Required):**
```bash
CENTRAL_AUTH_ISSUER=https://auth.example.com/
CENTRAL_AUTH_JWKS_URI=https://auth.example.com/.well-known/jwks.json
CENTRAL_AUTH_AUDIENCE=furtail-mobile
CENTRAL_AUTH_CLIENT_ID=furtail-mobile
CENTRAL_AUTH_REQUIRED_CLAIMS=sub,iss,aud,exp,iat,client_id
```

**Logging (Recommended):**
```bash
LOG_LEVEL=info  # or warn for production
```

**CORS (Recommended):**
```bash
CORS_ALLOWED_ORIGINS=https://app.furtail.world,https://mobile.furtail.world
CORS_ALLOW_CREDENTIALS=true
```

**Rate Limiting (Recommended):**
```bash
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=120
```

**Optional Services:**
```bash
# Payment (if enabling donations)
PAYMENT_PROVIDER=stripe
PAYMENT_API_KEY=sk_live_xxx

# Media storage (if enabling media upload)
MEDIA_STORAGE_TYPE=s3
MEDIA_STORAGE_BUCKET=furtail-media-prod
MEDIA_STORAGE_KEY=xxx
MEDIA_STORAGE_SECRET=xxx

# Email (if enabling notifications)
EMAIL_PROVIDER=sendgrid
EMAIL_API_KEY=SG.xxx
EMAIL_FROM_ADDRESS=noreply@furtail.world

# Redis (if enabling caching/rate limiting)
REDIS_HOST=redis-prod
REDIS_PORT=6379
REDIS_ENABLED=true
```

---

## Monitoring & Alerts Setup

### Logging
- [ ] Logs sent to centralized system (CloudWatch, Stackdriver, etc)
- [ ] Log retention policy: 90+ days
- [ ] Error logs isolated and alertable
- [ ] Request logs include correlation ID

### Metrics
- [ ] HTTP request latency tracked
- [ ] Error rate tracked
- [ ] Database query latency tracked
- [ ] Uptime/availability tracked
- [ ] Resource utilization tracked (CPU, memory, disk)

### Alerting
- [ ] Error rate > 1% → Alert
- [ ] Response time > 5 seconds → Alert
- [ ] Database CPU > 80% → Alert
- [ ] Database disk > 90% → Alert
- [ ] API downtime > 30 seconds → Alert
- [ ] Memory usage > 85% → Alert

### Dashboards
- [ ] Overview dashboard created
- [ ] Endpoint performance dashboard
- [ ] Database performance dashboard
- [ ] Error rate dashboard
- [ ] Traffic/load dashboard

---

## Disaster Recovery Checklist

### Backup & Recovery
- [ ] Database automated daily backups
- [ ] Backups stored in separate region
- [ ] Backup restoration tested (restore, verify, destroy)
- [ ] Recovery time objective (RTO): < 1 hour
- [ ] Recovery point objective (RPO): < 1 hour

### Rollback Plan
- [ ] Flutter app can be reverted to legacy API
- [ ] Data migration can be rolled back
- [ ] Traffic routing can be switched back
- [ ] Rollback procedure documented and tested

### High Availability
- [ ] API deployed across 2+ availability zones
- [ ] Database has multi-AZ failover
- [ ] Load balancer health checks enabled
- [ ] Graceful shutdown on termination signal

---

## Security Compliance Checklist

### Before Production Go-Live

**Application Security:**
- [ ] No SQL injection vulnerabilities
- [ ] No cross-site scripting (XSS)
- [ ] No cross-site request forgery (CSRF) vectors
- [ ] Input validation on all endpoints
- [ ] Output escaping on all responses
- [ ] Authentication required for protected endpoints
- [ ] Authorization checks on all protected resources
- [ ] Secrets not logged in error messages

**Data Security:**
- [ ] Database encryption at rest
- [ ] Database encryption in transit (SSL/TLS)
- [ ] API enforces HTTPS only
- [ ] Payment data never stored in application
- [ ] Personal data retention policy defined
- [ ] Data deletion working (GDPR compliance)

**Infrastructure Security:**
- [ ] Network segmentation (app/DB/cache)
- [ ] Security group rules restrictive
- [ ] DDoS protection enabled
- [ ] WAF rules configured (if available)
- [ ] Intrusion detection enabled (if available)

---

## Testing Before Go-Live

- [ ] All API endpoints tested manually
- [ ] Create user flow tested end-to-end
- [ ] Follow/unfollow flow tested
- [ ] Post creation/edit/delete tested
- [ ] Post reactions tested (like/bookmark)
- [ ] Adoption pet search tested
- [ ] Adoption pet detail tested
- [ ] Adoption pet report tested
- [ ] Profile view/edit tested
- [ ] User blocking tested
- [ ] Notifications tested (if enabled)
- [ ] Payment flow tested (if enabled)
- [ ] Login/logout tested
- [ ] Token refresh tested
- [ ] Error cases tested (404, 400, 500)
- [ ] Concurrent user load tested
- [ ] Database recovery tested
- [ ] Service restart tested

---

## Performance Baselines (For Comparison Post-Launch)

**Metrics to Monitor:**

| Metric | Baseline | Alert Threshold |
|--------|----------|-----------------|
| API Response Time (p99) | < 500ms | > 2000ms |
| API Response Time (p95) | < 200ms | > 1000ms |
| API Response Time (p50) | < 50ms | > 500ms |
| Error Rate | < 0.1% | > 1% |
| Database Query Time (p99) | < 200ms | > 1000ms |
| CPU Utilization | < 30% | > 70% |
| Memory Utilization | < 50% | > 80% |
| Disk Usage | < 60% | > 90% |
| Uptime | > 99.9% | < 99.5% |

---

## Sign-Off & Approval

### Required Approvals Before Production Deployment

- [ ] **Engineering Lead** — Code quality & architecture
  - Signed: ________________  Date: ________

- [ ] **DevOps Lead** — Infrastructure & deployment
  - Signed: ________________  Date: ________

- [ ] **Security Lead** — Security audit completed
  - Signed: ________________  Date: ________

- [ ] **Product Manager** — Feature completeness
  - Signed: ________________  Date: ________

### Deployment Authorization

- [ ] All checklist items checked
- [ ] All approvals obtained
- [ ] Rollback plan tested
- [ ] Communication plan prepared (stakeholders notified)
- [ ] Support team trained on new system

**Authorized to Deploy:** ________________  Date: ________

---

## Post-Deployment Verification

### Within 1 Hour of Deployment

- [ ] API responding to requests
- [ ] Health checks passing
- [ ] Readiness checks passing
- [ ] No error spikes in logs
- [ ] Database connections healthy
- [ ] Authentication working
- [ ] Basic endpoints tested

### Within 24 Hours of Deployment

- [ ] All monitored metrics within baseline
- [ ] No unplanned error rate increases
- [ ] No user-reported issues
- [ ] Backup jobs completed successfully
- [ ] Logs rotate properly
- [ ] Alerts configured correctly

### Within 7 Days of Deployment

- [ ] User metrics collected and reviewed
- [ ] Performance baselines confirmed
- [ ] Security audit completed post-launch
- [ ] Lessons learned documented
- [ ] On-call procedures validated

---

## Conclusion

**Status:** ✅ READY FOR STEP 14

All verification items in Step 13 have passed. The API is production-ready pending:

1. ✅ Code quality (VERIFIED)
2. ✅ Database migrations (VERIFIED)
3. ✅ Dependencies (VERIFIED)
4. ✅ Security (VERIFIED)
5. ✅ Configuration (VERIFIED)
6. ⏳ External services setup (Central Auth required, others optional)
7. ⏳ Infrastructure provisioning (database, load balancer, monitoring)
8. ⏳ Security certifications (SSL, firewall, DDoS protection)

**Next Step:** Step 14 — Prepare the production cutover and rollback plan without deploying.

