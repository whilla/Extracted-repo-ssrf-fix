# NexusAI Backup & Recovery Guide

## Overview

This document outlines the backup strategy, procedures, and disaster recovery plan for NexusAI.

## Backup Components

### 1. Database (Supabase/PostgreSQL)

**Frequency**: Daily automated backups

**Retention**:
- Daily backups: 30 days
- Weekly backups: 12 weeks
- Monthly backups: 12 months

**What to Back Up**:
- All tables (workspaces, brand_kits, drafts, app_settings, chat_threads, user_state)
- Row-Level Security (RLS) policies
- Database functions and triggers

**Supabase Managed Backups**:
Supabase provides automatic daily backups for all projects. Check your Supabase dashboard for backup settings.

### 2. File Storage (Puter.js / S3)

**Frequency**: Real-time sync + daily snapshots

**What to Back Up**:
- Generated media assets (images, videos, audio)
- User uploads
- Brand assets

**S3 Backup Strategy**:
```bash
# Create bucket versioning for point-in-time recovery
aws s3api create-bucket --bucket nexusai-backups --region us-east-1
aws s3api put-bucket-versioning --bucket nexusai-backups --versioning-configuration Status=Enabled
```

### 3. Application Configuration

**What to Back Up**:
- Environment variables (secrets only, stored in secure vault)
- Docker images
- Git repository

## Backup Procedures

### Manual Backup (Development/Testing)

```bash
# 1. Database dump
pg_dump -h $DB_HOST -U $DB_USER -d postgres > backup_$(date +%Y%m%d).sql

# 2. File storage sync
aws s3 sync s3://nexusai-assets s3://nexusai-backups/assets/$(date +%Y%m%d)

# 3. Configuration backup
tar -czf config_backup.tar.gz .env* docker-compose.yml Dockerfile
```

### Automated Backup (Production)

Use cron jobs or a backup service:

```bash
# /etc/cron.d/nexusai-backups
0 2 * * * root /opt/nexusai/scripts/backup.sh >> /var/log/nexusai-backup.log 2>&1
```

## Restoration Procedures

### Database Restoration

```bash
# 1. Stop the application
docker-compose stop nexusai-app

# 2. Restore from backup
psql -h $DB_HOST -U $DB_USER -d postgres < backup_20260101.sql

# 3. Verify data integrity
psql -h $DB_HOST -U $DB_USER -d postgres -c "SELECT COUNT(*) FROM workspaces;"

# 4. Restart application
docker-compose start nexusai-app
```

### File Restoration

```bash
# Restore specific date's files
aws s3 sync s3://nexusai-backups/assets/20260101 s3://nexusai-assets/

# Or restore single file
aws s3 cp s3://nexusai-backups/assets/20260101/image.png s3://nexusai-assets/image.png
```

## Disaster Recovery

### RTO (Recovery Time Objective)
- Critical services: 4 hours
- Full restoration: 24 hours

### RPO (Recovery Point Objective)
- Database: 1 hour (daily + hourly transaction logs)
- Files: 24 hours
- Configuration: 1 week

### Recovery Scenarios

#### Scenario 1: Database Corruption
1. Identify the issue and time of corruption
2. Restore from most recent clean backup
3. Apply transaction logs up to point of failure
4. Verify data integrity
5. Resume operations

#### Scenario 2: Loss of Primary Storage
1. Provision new storage
2. Restore from S3 backups
3. Update DNS/configuration
4. Verify file accessibility
5. Resume operations

#### Scenario 3: Complete System Failure
1. Spin up infrastructure in new region
2. Restore database from backup
3. Restore file storage from S3
4. Deploy application from container registry
5. Update DNS
6. Verify all services

## Monitoring

### Backup Verification
```bash
# Verify backup completion
grep "Backup completed" /var/log/nexusai-backup.log

# Test restoration (weekly)
./scripts/test-restore.sh
```

### Alerting
Set up alerts for:
- Failed backups
- Backup size anomalies
- Restoration test failures

## Security Considerations

1. **Encryption**: All backups must be encrypted at rest
2. **Access Control**: Use IAM roles, restrict backup access
3. **Offsite Storage**: Store backups in different region
4. **Secret Management**: Never include secrets in backups

## Testing

### Monthly Backup Test
1. Create test environment
2. Restore from latest backup
3. Verify all tables and data
4. Check application functionality
5. Document any issues

## Emergency Contacts

| Role | Contact |
|------|---------|
| Database Admin | (Your contact) |
| DevOps Lead | (Your contact) |
| Emergency Hotline | (Your contact) |

## Last Updated

2026-01-01