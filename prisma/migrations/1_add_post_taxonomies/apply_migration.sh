#!/bin/bash
# Manual migration application script
# Run this to apply the 1_add_post_taxonomies migration directly

export PGPASSWORD="furtail_app_password_local_dev"

psql -h localhost -p 5433 -U furtail_app_user -d furtail_app_local < migration.sql

echo "Migration applied. Now run: npx prisma migrate resolve --applied 1_add_post_taxonomies"
