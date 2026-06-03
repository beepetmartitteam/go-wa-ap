#!/bin/bash

# Database Backup Script
# This script creates automated backups of the PostgreSQL database

set -e

# Configuration
BACKUP_DIR="database/backups"
CONTAINER_NAME="chatflow-postgres"
DB_NAME="chatflow_api"
DB_USER="chatflow_user"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo "Starting database backup..."
echo "Backup directory: $BACKUP_DIR"
echo "Date: $DATE"

# Create backup
docker exec "$CONTAINER_NAME" pg_dump -U "$DB_USER" "$DB_NAME" > "$BACKUP_DIR/backup_$DATE.sql"

# Compress backup
gzip "$BACKUP_DIR/backup_$DATE.sql"

# Keep only last 7 days of backups
find "$BACKUP_DIR" -name "backup_*.sql.gz" -mtime +7 -delete

echo "Backup completed successfully: backup_$DATE.sql.gz"

# List current backups
echo "Current backups:"
ls -lh "$BACKUP_DIR"
