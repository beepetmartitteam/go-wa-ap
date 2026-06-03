#!/bin/bash

# ChatFlow Database Restore Script
# Usage: ./restore.sh backup_file.sql.gz

if [ $# -eq 0 ]; then
    echo "Usage: $0 backup_file.sql.gz"
    echo "Available backups:"
    ls -la backups/
    exit 1
fi

BACKUP_FILE="$1"
BACKUP_DIR="/backups"
FULL_PATH="$BACKUP_DIR/$BACKUP_FILE"

if [ ! -f "$FULL_PATH" ]; then
    echo "Backup file not found: $FULL_PATH"
    exit 1
fi

echo "Restoring from: $BACKUP_FILE"

# Extract backup if compressed
if [[ $BACKUP_FILE == *.gz ]]; then
    gunzip -c "$FULL_PATH" > /tmp/restore.sql
    RESTORE_FILE="/tmp/restore.sql"
else
    RESTORE_FILE="$FULL_PATH"
fi

# Stop the application first
echo "Stopping application..."
docker-compose down

# Drop existing database and recreate
echo "Recreating database..."
docker exec -i chatflow-postgres psql -U postgres -c "DROP DATABASE IF EXISTS chatflow_api;"
docker exec -i chatflow-postgres psql -U postgres -c "CREATE DATABASE chatflow_api;"

# Restore the database
echo "Restoring database..."
docker exec -i chatflow-postgres psql -U chatflow_user chatflow_api < "$RESTORE_FILE"

# Clean up
if [ -f "/tmp/restore.sql" ]; then
    rm /tmp/restore.sql
fi

# Start the application
echo "Starting application..."
docker-compose up -d

echo "Restore completed successfully!"
