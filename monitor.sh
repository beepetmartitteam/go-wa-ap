#!/bin/bash

# Monitoring Script
# This script checks the health of all services

set -e

PROJECT_DIR="/opt/go-wa-api"

echo "=========================================="
echo "Service Health Check"
echo "=========================================="
echo ""

cd "$PROJECT_DIR"

# Check Docker containers
echo "Docker Containers Status:"
docker-compose -f docker-compose.production.yml ps
echo ""

# Check disk space
echo "Disk Space Usage:"
df -h
echo ""

# Check memory usage
echo "Memory Usage:"
free -h
echo ""

# Check Docker resource usage
echo "Docker Resource Usage:"
docker stats --no-stream
echo ""

# Check recent logs for errors
echo "Recent Backend Errors (last 50 lines):"
docker-compose -f docker-compose.production.yml logs --tail=50 backend-api | grep -i error || echo "No errors found"
echo ""

# Check database connection
echo "Database Connection Test:"
docker exec chatflow-postgres pg_isready -U chatflow_user
echo ""

# Check Redis connection
echo "Redis Connection Test:"
docker exec chatflow-redis redis-cli ping
echo ""

echo "=========================================="
echo "Health Check Complete"
echo "=========================================="
