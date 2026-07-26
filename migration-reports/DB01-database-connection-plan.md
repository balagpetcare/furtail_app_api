# DB01 — Database Connection & Setup Plan

**Purpose:** Safe, reversible database configuration plan for local development and production  
**Status:** Planning document (no database connections attempted, no .env created)

---

## Local Development Configuration (Recommended)

### 1. PostgreSQL Setup

**Install (Local Development Only):**

```bash
# macOS (Homebrew)
brew install postgresql@16

# Ubuntu/Debian
sudo apt-get install postgresql postgresql-contrib

# Windows (Installer)
# Download from: https://www.postgresql.org/download/windows/
```

**Create Local Database:**

```bash
# Start PostgreSQL service
pg_ctl start (Windows)
sudo systemctl start postgresql (Linux)

# Create user with minimal privileges
createuser -P furtail_dev
# Enter password: [choose secure password]

# Create development database
createdb -O furtail_dev furtail_app

# Verify
psql -U furtail_dev -d furtail_app -c "SELECT version();"
```

### 2. Environment Variables (Local Development)

**File:** `.env` (git-ignored, never committed)

```bash
# Database Configuration
NODE_ENV=development
DATABASE_URL=postgresql://furtail_dev:${POSTGRES_PASSWORD}@localhost:5432/furtail_app

# API Configuration
PORT=7300
LOG_LEVEL=debug

# Authentication (optional for development, required for production)
CENTRAL_AUTH_ISSUER=https://auth.example.com/
CENTRAL_AUTH_JWKS_URI=https://auth.example.com/.well-known/jwks.json
CENTRAL_AUTH_AUDIENCE=furtail-mobile

# CORS (local development)
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:7300

# Service Info
SERVICE_NAME=furtail-app-api
SERVICE_VERSION=0.1.0
```

**Security Note:** Store password in environment or `.env` file (git-ignored)

### 3. Connection Pooling (Local Development)

**Native Approach:** Single Node.js process (no pooling needed)

**Production:** Use PgBouncer or AWS RDS Proxy

```bash
# Install PgBouncer (production)
apt-get install pgbouncer

# Configure (production only)
# /etc/pgbouncer/pgbouncer.ini
[databases]
furtail_app = host=db.internal port=5432 user=app_user password=secure_password

[pgbouncer]
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 25
```

---

## Testing Database Configuration

### Isolated Test Database

**Purpose:** Run integration tests without affecting development data

**Create Test Database:**

```bash
# Create test-specific database
createdb -O furtail_dev furtail_app_test

# Create test user (optional)
createuser -P furtail_test
createdb -O furtail_test furtail_app_test
```

**Test Environment (.env.test):**

```bash
NODE_ENV=test
DATABASE_URL=postgresql://furtail_test:${TEST_DB_PASSWORD}@localhost:5432/furtail_app_test
LOG_LEVEL=error
PORT=7301
```

**Jest Configuration:**

```typescript
// jest.config.js
module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: ['**/*.spec.ts'],
  collectCoverageFrom: ['src/**/*.ts'],
};

// jest.setup.ts
beforeAll(async () => {
  // Run Prisma migrations on test database
  await exec('npx prisma migrate deploy --skip-generate');
});

afterAll(async () => {
  // Clean up (optional: truncate tables or keep for inspection)
  await prisma.$disconnect();
});
```

---

## Production Database Configuration

### AWS RDS PostgreSQL (Recommended for Production)

**Instance Specifications:**

```
Engine: PostgreSQL 16
Instance Class: db.m6i.large (2 vCPU, 8GB RAM, ~$200/month)
Storage: 100GB gp3 SSD (auto-scaling enabled)
Multi-AZ: Yes (automatic failover)
Backup: Daily, 30-day retention
SSL/TLS: Yes, required
```

**Networking:**

```
VPC: Private subnet (no direct internet access)
Security Group: 
  - Inbound 5432 (PostgreSQL) from app servers only
  - Outbound: Allow to S3, CloudWatch for logs
Connection Pooling: AWS RDS Proxy (optional, 1 connection per app server)
```

**Database & User Creation:**

```bash
# Connect to RDS primary instance
psql -h furtail-db-prod.c9akciq32.us-east-1.rds.amazonaws.com \
  -U postgres \
  -d postgres

# Create application user (minimal privileges)
CREATE USER app_user WITH PASSWORD 'complex_password_here';
CREATE DATABASE furtail_db OWNER app_user;

# Create migration user (elevated privileges, used only during schema changes)
CREATE USER migration_user WITH PASSWORD 'complex_password_here';
GRANT ALL PRIVILEGES ON DATABASE furtail_db TO migration_user;

# Assign required permissions
GRANT CONNECT ON DATABASE furtail_db TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO app_user;
```

**Production Environment Variables:**

```bash
# Injected via AWS Secrets Manager or ECS task definition
NODE_ENV=production
DATABASE_URL=postgresql://app_user:${SECURE_PASSWORD}@furtail-db-prod.c9akciq32.us-east-1.rds.amazonaws.com:5432/furtail_db?sslmode=require

# Central Auth (must be configured before go-live)
CENTRAL_AUTH_ISSUER=https://auth.example.com/
CENTRAL_AUTH_JWKS_URI=https://auth.example.com/.well-known/jwks.json
CENTRAL_AUTH_AUDIENCE=furtail-mobile

# API Configuration
PORT=7300
LOG_LEVEL=warn
REQUEST_TIMEOUT_MS=30000

# CORS (restrict to Flutter app domain only)
CORS_ALLOWED_ORIGINS=https://app.furtail.world

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=120

# Service Info
SERVICE_NAME=furtail-app-api
SERVICE_VERSION=0.1.0
```

---

## SSL/TLS Configuration

### Development (Optional)

```bash
# Self-signed certificate (not for production)
# Not required for localhost PostgreSQL connection
DATABASE_URL=postgresql://localhost:5432/furtail_app

# OR with SSL (if PostgreSQL configured with SSL)
DATABASE_URL=postgresql://localhost:5432/furtail_app?sslmode=require
```

### Production (Required)

```bash
# AWS RDS with SSL mandatory
DATABASE_URL=postgresql://app_user:password@furtail-db-prod.rds.amazonaws.com:5432/furtail_db?sslmode=require

# Certificate validation
# AWS RDS uses valid certificates signed by Amazon RDS CA
# Prisma automatically validates using system CA certificates
```

---

## Connection Pool Configuration

### Development (Single Process)

```typescript
// src/database.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  // Default pool: 2 connections, no connection limit in development
});

export default prisma;
```

**Sufficient for:** Single developer, local testing, CI/CD

### Production (Horizontal Scale)

**Problem:** Multiple API instances × default pool size = connection exhaustion

**Solution: AWS RDS Proxy**

```typescript
// Same code, but DATABASE_URL points to proxy
// RDS Proxy URL (instead of direct RDS instance)
DATABASE_URL=postgresql://app_user:password@furtail-db-proxy.c9akciq32.us-east-1.rds.amazonaws.com:5432/furtail_db

// RDS Proxy manages pool (default: 25 connections per app server)
// Actual connections to RDS: ~25, not 25×num_servers
```

**OR: Connection Pooling Middleware**

```typescript
// PgBouncer (if self-hosted)
DATABASE_URL=postgresql://app_user:password@pgbouncer.internal:6432/furtail_db

// pgBouncer config
# pool_mode = transaction (fastest, safest for most workloads)
# max_client_conn = 1000
# default_pool_size = 25
```

---

## Migration User Strategy

### Why Separate Users?

**Development:** Single user can do everything

**Production:** 
- **app_user**: Minimal privileges (SELECT, INSERT, UPDATE, DELETE)
- **migration_user**: Elevated privileges (ALTER TABLE, CREATE INDEX, etc.)

**Benefit:** Limits damage if app credentials compromised

### Implementation

```bash
# Create two users during RDS setup
CREATE USER app_user WITH PASSWORD 'app_password';
CREATE USER migration_user WITH PASSWORD 'migration_password';

# Migration-only privilege
GRANT ALL PRIVILEGES ON DATABASE furtail_db TO migration_user;

# App-only privileges (minimal)
GRANT CONNECT, TEMP ON DATABASE furtail_db TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_user;
```

### Prisma Configuration

```typescript
// .env (development)
DATABASE_URL=postgresql://furtail_dev:password@localhost:5432/furtail_app

// .env.migrations (production, used only during cutover)
DATABASE_URL=postgresql://migration_user:migration_password@furtail-db-prod.rds.amazonaws.com:5432/furtail_db

// Application runtime (.env, production)
DATABASE_URL=postgresql://app_user:app_password@furtail-db-prod.rds.amazonaws.com:5432/furtail_db
```

---

## Backup & Recovery Configuration

### Development (Optional)

```bash
# Manual backup before destructive testing
pg_dump furtail_app > backup_$(date +%Y%m%d).sql

# Restore from backup
psql furtail_app < backup_20260726.sql
```

### Production (Required)

**AWS RDS Automatic Backups:**

```
Backup retention: 30 days (configurable, 1-35 days)
Backup window: 02:00-03:00 UTC (customize as needed)
Multi-AZ: Enabled (backups from standby, no performance impact)
Encryption: Enabled (KMS key-managed)
```

**Point-in-Time Recovery:**

```bash
# Restore to a specific point in time
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier furtail-db-prod \
  --db-instance-identifier furtail-db-prod-restored \
  --restore-time "2026-07-26T10:00:00Z"

# This creates a new instance (no downtime to current instance)
```

**Restore Procedure:**

```bash
# 1. Restore to new instance
# 2. Verify data integrity
# 3. Promote to primary (if needed)
# 4. Update app connection strings
# 5. Monitor for issues
```

**Tested Restore Timeline:**
- Restore creation: ~5-10 minutes
- Data verification: ~10-30 minutes (depends on size)
- Application cut-over: < 5 minutes
- **Total RTO:** ~20-45 minutes

---

## Monitoring & Maintenance

### Health Checks

```typescript
// src/routes/health.routes.ts
export async function health(req: Request, res: Response) {
  try {
    // Liveness: process is running
    return res.json({ status: 'alive' });
  } catch (error) {
    return res.status(503).json({ status: 'dead', error: error.message });
  }
}

export async function ready(req: Request, res: Response) {
  try {
    // Readiness: database is accessible
    await prisma.user.findFirst();
    return res.json({ 
      status: 'ready',
      dependencies: { database: 'AVAILABLE' }
    });
  } catch (error) {
    return res.status(503).json({ 
      status: 'degraded',
      dependencies: { database: 'UNAVAILABLE', error: error.message }
    });
  }
}
```

**Load Balancer Configuration:**
- Health check: `/health` every 10 seconds
- Readiness check: `/ready` every 30 seconds
- Mark unhealthy: 2 consecutive failures
- Remove from rotation: Automatic

### Database Monitoring

**CloudWatch Metrics (AWS RDS):**
```
- CPU Utilization (alert > 70%)
- Database Connections (alert > 80% of max)
- Read/Write Latency (alert > 100ms)
- Disk Space (alert > 90% used)
- Network I/O Throughput
```

**Alarms:**

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name furtail-db-cpu-high \
  --metric-name CPUUtilization \
  --namespace AWS/RDS \
  --statistic Average \
  --period 300 \
  --threshold 70 \
  --comparison-operator GreaterThanThreshold \
  --alarm-actions arn:aws:sns:us-east-1:123456789:ops-alerts
```

---

## Rollback Path (If Database Issues)

### Scenario 1: Application Cannot Connect

**Symptoms:**
- Health check fails
- Readiness returns UNAVAILABLE
- Logs: "ECONNREFUSED" or "ENOTFOUND"

**Investigation:**
```bash
# Check connection string
echo $DATABASE_URL

# Verify database is running
psql -h localhost -U furtail_dev -d furtail_app -c "SELECT 1;"

# Check network connectivity (production)
nc -zv furtail-db-prod.rds.amazonaws.com 5432

# Check security groups / firewall
aws ec2 describe-security-groups --group-ids sg-xxxxx
```

**Remediation:**
- Verify credentials correct
- Verify host/port accessible
- Restart application
- Point to backup database if primary unavailable

### Scenario 2: Database Corruption

**Symptoms:**
- Prisma migration fails
- Constraints violated
- Foreign key errors

**Investigation:**
```bash
# Check database integrity
PRAGMA integrity_check;  -- SQLite
ANALYZE;  -- PostgreSQL
```

**Remediation:**
- Restore from latest backup (< 24 hours old)
- Replay recent transactions from application logs
- Manual reconciliation if needed

---

## Implementation Checklist

### Before Development Starts

- [ ] Create local PostgreSQL database
- [ ] Create `.env` file (git-ignored)
- [ ] Test connection via Prisma
- [ ] Run `npm run prisma:migrate` to create schema
- [ ] Run `npm run prisma:seed` to load reference data

### Before Production Deployment

- [ ] Provision AWS RDS PostgreSQL 16
- [ ] Create app_user and migration_user
- [ ] Configure automated backups (30-day retention)
- [ ] Enable Multi-AZ failover
- [ ] Enable encryption at rest
- [ ] Test backup restoration
- [ ] Configure CloudWatch alarms
- [ ] Set up RDS Proxy (if load balancing needed)
- [ ] Test application connectivity to RDS
- [ ] Document connection string format
- [ ] Create runbook for failover/restore

### After Cutover

- [ ] Verify backups running daily
- [ ] Monitor connection pool usage
- [ ] Monitor query performance
- [ ] Review CloudWatch metrics weekly
- [ ] Update disaster recovery runbooks

---

## Environment Variables Summary

### Development (.env)

```bash
NODE_ENV=development
DATABASE_URL=postgresql://furtail_dev:password@localhost:5432/furtail_app
PORT=7300
LOG_LEVEL=debug
```

### Testing (.env.test)

```bash
NODE_ENV=test
DATABASE_URL=postgresql://furtail_test:password@localhost:5432/furtail_app_test
PORT=7301
LOG_LEVEL=error
```

### Production (.env, injected via secrets)

```bash
NODE_ENV=production
DATABASE_URL=postgresql://app_user:password@furtail-db-prod.rds.amazonaws.com:5432/furtail_db?sslmode=require
PORT=7300
LOG_LEVEL=warn
CENTRAL_AUTH_ISSUER=https://auth.example.com/
CENTRAL_AUTH_JWKS_URI=https://auth.example.com/.well-known/jwks.json
```

---

## Safety Rules (Enforced)

✅ **DO:**
- Use separate databases for dev/test/prod
- Use separate users for app/migration operations
- Store credentials in environment (not code)
- Encrypt connections in production (sslmode=require)
- Backup before each migration
- Test restore procedures quarterly

❌ **DO NOT:**
- Commit .env files to git
- Use production credentials in development
- Disable SSL in production
- Use root/admin user for application
- Hardcode database URLs in code

---

## Next Steps

1. **DB Step 2:** Implement location + animal models in Prisma schema
2. **DB Step 3:** Create seed infrastructure
3. **Before Cutover:** Provision production database and test restoration
4. **During Cutover:** Execute migrations and seed reference data

---

## Conclusion

**Database Connection Strategy:**

✅ **Development:** Single PostgreSQL instance (localhost), minimal setup  
✅ **Testing:** Separate test database (git-ignored credentials)  
✅ **Production:** AWS RDS Multi-AZ with backups, RDS Proxy for scaling, separate app/migration users  
✅ **Secure:** SSL/TLS required, passwords in environment, minimal privileges  
✅ **Recoverable:** Automated backups, PITR capability, documented restore procedures

This plan supports safe local development and production reliability.

