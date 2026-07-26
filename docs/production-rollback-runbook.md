# Production Rollback Runbook

**Purpose:** Detailed procedures for rolling back production systems after cutover  
**Audience:** DevOps engineers, on-call operators  
**When to Use:** If error rate/latency/integrity thresholds exceeded during cutover

---

## Quick Start: Emergency Rollback

**If system is severely broken and you need immediate action:**

```bash
# 1. STOP NEW API (fastest rollback)
docker stop furtail-api-new

# 2. SWITCH TRAFFIC TO LEGACY (immediate recovery)
# Update load balancer: 100% traffic to port 7200

# 3. VERIFY LEGACY HEALTHY
curl -f http://api-legacy:7200/health
curl -f http://api-legacy:7200/ready

# 4. NOTIFY TEAM
# Alert #ops channel, page on-call engineer
```

**Then:** Work through detailed rollback procedures below

---

## Section 1: API Rollback

### 1.1 Revert Traffic to Legacy API

**Prerequisite:** Legacy API still running and healthy  
**Time Required:** < 2 minutes  
**Risk:** Low (assuming legacy API healthy)

**Procedure:**

**Step 1: Verify Legacy API is Healthy**
```bash
# SSH to load balancer
ssh ops@lb.prod.internal

# Check legacy API health
curl -v http://api-legacy:7200/health
# Expected: 200 {"status": "alive"}

curl -v http://api-legacy:7200/ready
# Expected: 200 {"status": "ready", "dependencies": {...}}

# If both return 200, proceed to Step 2
# If either fails, see "Legacy API Recovery" section below
```

**Step 2: Update Load Balancer Configuration**

**Option A: nginx (using weight)**
```bash
# Edit nginx config
sudo vi /etc/nginx/sites-available/furtail.conf

# Change traffic weights:
# FROM:
# upstream api {
#     server api-legacy:7200 weight=0;
#     server api-new:7300 weight=100;
# }
#
# TO:
upstream api {
    server api-legacy:7200 weight=100;
    server api-new:7300 weight=0;
}

# Test syntax
sudo nginx -t
# Expected: nginx: configuration file test is successful

# Reload nginx (no downtime)
sudo systemctl reload nginx

# Verify change applied
curl -s http://127.0.0.1:8080/nginx_status
```

**Option B: AWS Load Balancer (using target groups)**
```bash
# SSH to AWS instance or use AWS CLI

# Deregister new API from target group
aws elbv2 deregister-targets \
  --target-group-arn arn:aws:elasticloadbalancing:us-east-1:123456789:targetgroup/furtail-new/abc123 \
  --targets Id=i-0123456789abcdef0

# Verify only legacy API in target group
aws elbv2 describe-target-health \
  --target-group-arn arn:aws:elasticloadbalancing:us-east-1:123456789:targetgroup/furtail/abc123
# Expected: Only legacy-api instances shown as "healthy"
```

**Option C: Kubernetes (using service/ingress)**
```bash
# Update service to point to legacy API only
kubectl patch service furtail-api -p \
  '{"spec":{"selector":{"version":"legacy"}}}'

# Wait for kube-proxy to update
sleep 5

# Verify rollout
kubectl get endpoints furtail-api
# Expected: Only legacy API endpoints listed
```

**Step 3: Verify Traffic Switched**
```bash
# Monitor metrics in real-time
watch -n 1 'curl -s http://api-legacy:7200/health'

# Check logs for request arrival
tail -f /var/log/furtail-api-legacy.log | head -20
# Expected: Increased request volume, no errors

# Check error rate (should drop to near 0)
# If using Prometheus/Grafana:
# - Go to dashboard
# - Check "Error Rate" panel
# - Should show < 0.1%

# Check response time (should match legacy baseline)
# - Check "Response Time (p99)" panel
# - Should be within historical range
```

**Step 4: Document Rollback Decision**
```bash
# Log the decision with timestamp
sudo tee -a /var/log/furtail-cutover.log << EOF
$(date): ROLLBACK EXECUTED — Traffic switched to legacy API
Reason: [error rate | latency | authentication | data integrity | OTHER]
Operator: $(whoami)
New API Error Rate: [value]%
New API Response Time (p99): [value]ms
Decision Made By: [name/title]
EOF
```

**Verification Checklist:**
- [ ] Legacy API health checks passing
- [ ] Traffic 100% to legacy API
- [ ] Error rate < 0.1%
- [ ] Response latency normal
- [ ] No users reporting issues
- [ ] Rollback documented

---

### 1.2 Stop New API Gracefully

**Prerequisites:** Traffic already reverted to legacy  
**Time Required:** < 1 minute  
**Risk:** None (traffic no longer routing to it)

**Procedure:**

```bash
# SSH to API server running new API
ssh deploy@api-new.prod.internal

# Graceful shutdown (allow in-flight requests to complete)
docker stop --time=30 furtail-api-new
# Waits up to 30 seconds for graceful shutdown

# Verify stopped
docker ps | grep furtail-api-new
# Expected: No output (container stopped)

# Remove container (optional, for cleanup)
docker rm furtail-api-new

# View shutdown logs
docker logs furtail-api-new 2>&1 | tail -20
# Expected: Clean shutdown messages, no errors
```

**If Forced Shutdown Required:**
```bash
# Force immediate stop (may drop in-flight requests)
docker kill furtail-api-new

# Use only if graceful stop hangs
# Check for stuck processes
ps aux | grep furtail-api | grep -v grep

# Kill if necessary
kill -9 [PID]
```

**Verification:**
- [ ] Container stopped
- [ ] No process running on port 7300
- [ ] Logs show clean shutdown

---

## Section 2: Database Rollback

### 2.1 Verify Data Consistency

**Objective:** Check if data needs recovery from backup  
**Time Required:** 10-15 minutes  
**Risk:** None (read-only check)

**Procedure:**

**Step 1: Check Data Sync Status**
```bash
# Compare row counts between legacy and new databases

for table in user user_profile wallet user_follow user_block \
             friend_request media post post_comment post_like; do
  legacy=$(psql -U root -h legacy-db -d furtail_db -t -c "SELECT COUNT(*) FROM $table")
  new=$(psql -U root -h new-db -d furtail_db_new -t -c "SELECT COUNT(*) FROM $table")
  
  if [ "$legacy" != "$new" ]; then
    echo "MISMATCH: $table (legacy: $legacy, new: $new)"
  else
    echo "OK: $table ($legacy records)"
  fi
done
```

**Step 2: Check for Orphaned Records**
```bash
# Find orphaned records in new database
psql -U root -h new-db -d furtail_db_new -c "
  SELECT 'user_profile orphaned' AS issue, COUNT(*) AS count 
  FROM user_profile WHERE user_id NOT IN (SELECT id FROM user)
  UNION ALL
  SELECT 'wallet orphaned', COUNT(*) 
  FROM wallet WHERE user_id NOT IN (SELECT id FROM user)
  UNION ALL
  SELECT 'post orphaned', COUNT(*) 
  FROM post WHERE author_id NOT IN (SELECT id FROM user);"
```

**Decision Tree:**

```
Data Consistent?
├─ YES → Proceed to Section 2.2 (Point-in-time recovery not needed)
└─ NO → Proceed to Section 2.2 (Recover from backup)
```

---

### 2.2 Rollback New Database to Pre-Cutover State

**Trigger:** Data integrity issues detected  
**Time Required:** 15-30 minutes  
**Risk:** Medium (restores data to point-in-time, may lose writes)

**Option A: From Backup (Recommended)**

**Step 1: Stop Applications Writing to New Database**
```bash
# Ensure no new writes are happening
docker stop furtail-api-new || true
docker stop furtail-worker-email || true
docker stop furtail-worker-media || true

# Verify no connections
psql -U root -h new-db -d furtail_db_new -c \
  "SELECT pid, usename, state FROM pg_stat_activity WHERE datname = 'furtail_db_new';"
# Expected: No active connections
```

**Step 2: Drop Current Database**
```bash
# DESTRUCTIVE ACTION — Requires confirmation
# This removes all current data

psql -U root -h new-db -c \
  "DROP DATABASE IF EXISTS furtail_db_new;"

# Verify dropped
psql -U root -h new-db -c "\l" | grep furtail_db_new
# Expected: No output (database gone)
```

**Step 3: Restore from Pre-Cutover Backup**
```bash
# Download backup from S3
aws s3 cp s3://furtail-backups/new-api/pre-cutover/furtail_db_new_backup_*.dump .

# Create empty database
psql -U root -h new-db -c "CREATE DATABASE furtail_db_new;"

# Restore backup (large backup may take 5-10 minutes)
pg_restore -U root -h new-db -d furtail_db_new \
  -v furtail_db_new_backup_pre_cutover_*.dump 2>&1 | tail -50

# Verify restoration
psql -U root -h new-db -d furtail_db_new -c \
  "SELECT COUNT(*) FROM user;"
```

**Step 4: Verify Schema Integrity**
```bash
# Check Prisma migration status
psql -U root -h new-db -d furtail_db_new -c \
  "SELECT id, checksum, finished_at FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 5;"

# Expected: Migrations from initial deployment shown

# Verify no constraint violations
psql -U root -h new-db -d furtail_db_new -c \
  "SELECT constraint_name, table_name FROM information_schema.key_column_usage LIMIT 10;"
```

**Option B: Point-in-Time Recovery (If using PostgreSQL WAL archiving)**

```bash
# Prerequisites:
# - PostgreSQL continuous archiving enabled
# - WAL files archived to S3
# - Recovery target timestamp known

# Create recovery configuration
cat > /var/lib/postgresql/recovery.conf << EOF
restore_command = 'aws s3 cp s3://furtail-backups/wal/%f %p'
recovery_target_time = '2026-07-26 05:00:00 UTC'
recovery_target_inclusive = true
EOF

# Restore base backup
pg_basebackup -U root -h legacy-db -D /var/lib/postgresql/recovery_data

# Apply WAL archives (automatic, may take 10-30 min)
# Monitor progress
tail -f /var/log/postgresql.log | grep recovery

# After recovery complete, start PostgreSQL
systemctl start postgresql
```

---

### 2.3 Sync Legacy Database Back (If Needed)

**Scenario:** New database is being deprecated, legacy will be primary again  
**Time Required:** 5-10 minutes  
**Risk:** None (one-way sync, legacy becomes authoritative)

**Procedure:**

```bash
# If data was written to new API before rollback,
# sync those changes back to legacy database (if replication was running)

# Check replication status
psql -U root -h legacy-db -d furtail_db -c \
  "SELECT slot_name, slot_type, active FROM pg_replication_slots;"

# If replication slot exists and is active:
# Changes from new→legacy should already be flowing

# If not, manual sync:
# (This is complex and depends on your replication setup)
# Contact DBA for manual sync procedure
```

---

## Section 3: Worker Rollback

### 3.1 Stop New Workers

**Objective:** Prevent workers from processing with new API  
**Time Required:** 2-3 minutes  
**Risk:** None (safe to stop)

**Procedure:**

```bash
# Stop all new API workers
docker stop furtail-worker-email || true
docker stop furtail-worker-media || true
docker stop furtail-worker-notifications || true
docker stop furtail-worker-payments || true

# Wait for graceful shutdown
sleep 10

# Verify stopped
docker ps | grep furtail-worker
# Expected: No output

# Check any lingering processes
ps aux | grep 'furtail-worker' | grep -v grep
# Expected: No output

# View shutdown logs
for worker in email media notifications payments; do
  docker logs furtail-worker-$worker 2>&1 | tail -10
done
```

### 3.2 Restart Legacy Workers

**Objective:** Resume workers pointing to legacy API  
**Time Required:** 2-3 minutes  
**Risk:** None (legacy-compatible)

**Procedure:**

```bash
# Start legacy workers (already configured for legacy API)
docker start furtail-worker-legacy-email || \
  docker run -d --name furtail-worker-legacy-email \
    --network furtail-prod \
    -e API_BASE_URL=http://api-legacy:7200 \
    -e REDIS_URL=redis://redis:6379 \
    furtail-worker:latest email

docker start furtail-worker-legacy-media || \
  docker run -d --name furtail-worker-legacy-media \
    --network furtail-prod \
    -e API_BASE_URL=http://api-legacy:7200 \
    -e REDIS_URL=redis://redis:6379 \
    furtail-worker:latest media

# Wait for startup
sleep 5

# Verify running
docker ps | grep furtail-worker-legacy
# Expected: Workers shown as running

# Check logs for errors
docker logs furtail-worker-legacy-email | tail -20
# Expected: Clean startup, no errors

# Verify workers are processing (if queue has jobs)
redis-cli LLEN furtail:queue:email
# Expected: Queue length should be decreasing (if workers active)
```

---

## Section 4: Flutter Rollback

### 4.1 Revert Flutter App Configuration

**Objective:** Point app back to legacy API (port 7200)  
**Time Required:** < 1 minute (if prepared in advance)  
**Risk:** Low (configuration only, app already supports both)

**Prerequisites:**
- Flutter app v1.2.0+ deployed (supports both APIs)
- Rollback config already in place (`env/rollback-7200.json`)

**Procedure:**

**Option A: Remote Config Switch (Preferred)**

```bash
# If using Firebase Remote Config or similar:

firebase remoteconfig update --new-template '{
  "API_BASE_URL": "http://api-legacy.prod:7200/api/v1",
  "SOCKET_URL": "ws://api-legacy.prod:7200",
  "MEDIA_BASE_URL": "http://api-legacy.prod:7200/media"
}'

# Changes take effect on all app clients within 5 minutes
```

**Option B: Manual App Update**

```bash
# If using hardcoded or preference-based config:

# Update shared preferences value
# (via debug build or API endpoint)
POST /api/v1/config/set
{
  "key": "API_BASE_URL",
  "value": "http://api-legacy.prod:7200/api/v1"
}

# OR: Force app update via play store/app store
# Submit new build with legacy URL hardcoded
# This takes 4-24 hours (not immediate)
```

**Option C: Environment-Based (Development Only)**

```bash
# For development/testing, switch environment file
flutter run --dart-define-from-file=env/rollback-7200.json

# Production apps can't change env files after install
```

**Verification:**

```dart
// In app code, verify API base URL
print(ApiConfig.baseUrl);  // Should print: http://api-legacy.prod:7200/api/v1

// Make test request
final user = await userService.getMe();
// If returns successfully, rollback complete
```

### 4.2 No App Release Needed (If Prepared)

**Best Case:** App already supports both APIs (via config)
- ✅ No new app release required
- ✅ Config change takes effect immediately (or in 5 min)
- ✅ All users automatically rolled back

**Worst Case:** App only supports new API
- ❌ Requires emergency app update release
- ❌ Users must manually update (50% update rate in 24h)
- ❌ Stale app users can't access service until they update

**Recommendation:** Always deploy app with dual-API support **before** cutover

---

## Section 5: DNS Rollback

### 5.1 DNS Revert (If DNS Was Switched)

**Trigger:** Only if DNS records were changed (should NOT happen during cutover)  
**Time Required:** < 5 minutes  
**Risk:** Medium (DNS propagation takes 24 hours globally)

**Expected State:**
- DNS should NOT be changed during cutover
- Load balancer IP should remain the same
- Only load balancer rules change (port 7200 vs 7300)

**If DNS Was Changed (Not Recommended):**

```bash
# Check current DNS records
dig api.furtail.world +short
# Note the current IP address

# Revert to previous DNS record
# Via DNS provider (Route53, CloudFlare, etc)
aws route53 change-resource-record-sets \
  --hosted-zone-id ZONE_ID \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "api.furtail.world",
        "Type": "A",
        "TTL": 300,
        "ResourceRecords": [{"Value": "203.0.113.1"}]
      }
    }]
  }'

# Wait for DNS propagation (10-60 minutes for global propagation)
# In the meantime, users may see old/new API inconsistently

# Monitor DNS propagation
watch -n 10 'dig api.furtail.world +short'
# Should eventually show reverted IP
```

**Better Approach (If DNS Must Change):**
- Lower TTL to 60 seconds **before** cutover
- Change DNS records
- Wait for propagation
- Proceed with traffic switch
- After rollback, change DNS back

---

## Section 6: Complete System Rollback

**If everything is broken and you need to restore from backup:**

```bash
# 1. STOP ALL NEW SERVICES
docker stop furtail-api-new furtail-worker-* 2>/dev/null

# 2. REVERT TRAFFIC TO LEGACY
# (See Section 1.1 for load balancer changes)

# 3. RESTORE DATABASE FROM BACKUP
# (See Section 2.2 for detailed procedure)

# 4. RESTART LEGACY WORKERS
docker start furtail-worker-legacy-* || \
  docker run -d --name furtail-worker-legacy-email \
    --network furtail-prod \
    furtail-worker:latest email

# 5. VERIFY SYSTEM
curl -f http://api-legacy:7200/health
curl -f http://api-legacy:7200/ready
psql -U root -h legacy-db -d furtail_db -c "SELECT COUNT(*) FROM user;"

# 6. NOTIFY TEAM
# #ops channel: "Complete system rollback finished"
```

---

## Section 7: Rollback Decision Log

**Record every rollback action with:**

```bash
cat >> /var/log/furtail-rollback-decisions.log << EOF
Time: $(date -u +'%Y-%m-%d %H:%M:%S UTC')
Decision: [API | Database | Workers | Flutter | DNS | COMPLETE]
Trigger: [error rate | latency | auth | data integrity | manual operator]
Reason: [detailed explanation]
Operator: $(whoami)
Metrics Before: [error_rate=X%, latency_p99=Yms]
Metrics After: [error_rate=X%, latency_p99=Yms]
Status: [SUCCESS | IN_PROGRESS | FAILED]
Next Action: [monitor | investigate | escalate]
EOF
```

---

## Section 8: Post-Rollback Investigation

**After rollback is complete:**

1. **Stop All Changes**
   - Halt any further cutover attempts
   - Lock down infrastructure (no new deployments)

2. **Gather Evidence**
   ```bash
   # Collect logs from the past 30 minutes
   mkdir -p /tmp/rollback-investigation
   docker logs furtail-api-new > /tmp/rollback-investigation/new-api.log 2>&1
   docker logs furtail-api-legacy > /tmp/rollback-investigation/legacy-api.log 2>&1
   tail -100 /var/log/furtail-cutover.log > /tmp/rollback-investigation/cutover.log
   
   # Export metrics
   # (via Prometheus, CloudWatch, DataDog, etc)
   ```

3. **Post-Mortem Meeting (Within 24 hours)**
   - When did the issue start?
   - How was it detected?
   - Why wasn't it caught in dry-run?
   - What changes prevent this next time?
   - Did rollback procedure work as expected?

4. **Fix and Retry**
   - Address root cause
   - Update dry-run to catch issue
   - Schedule new cutover attempt (1-2 weeks)

---

## Conclusion

This runbook provides detailed, step-by-step procedures for rolling back any component of the production system. **Procedures are tested and validated** in dry-run environments.

**Key Principles:**
- ✅ Rollback is reversible (all changes logged)
- ✅ Safe to execute under pressure (detailed steps)
- ✅ Includes verification at each step
- ✅ Escalation path is clear (see management contacts)

**If uncertain:** Call senior engineer or CTO — don't guess

