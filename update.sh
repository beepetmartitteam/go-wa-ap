#!/bin/bash

# Application Update Script
# This script updates the application to the latest version

set -e

PROJECT_DIR="/opt/go-wa-api"

echo "Starting application update..."

# Navigate to project directory
cd "$PROJECT_DIR"

# Pull latest changes
echo "Pulling latest changes from repository..."
git pull

# Rebuild Docker images
echo "Rebuilding Docker images..."
docker-compose -f docker-compose.production.yml build

# Restart services
echo "Restarting services..."
docker-compose -f docker-compose.production.yml up -d

# Wait for services to start
echo "Waiting for services to start..."
sleep 30

# Check service status
echo "Checking service status..."
docker-compose -f docker-compose.production.yml ps

echo "Update completed successfully!"
