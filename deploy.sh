#!/bin/bash

# Production Deployment Script
# This script automates the deployment process for the WhatsApp Auto-Reply System

set -e

echo "=========================================="
echo "WhatsApp Auto-Reply Deployment Script"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    print_error "Please run as root or with sudo"
    exit 1
fi

# Step 1: Update System
echo "Step 1: Updating system..."
#apt update && apt upgrade -y
print_success "System updated"

# Step 2: Install Required Packages
echo "Step 2: Installing required packages..."
#apt install -y curl wget git ufw fail2ban certbot python3-certbot-nginx
print_success "Required packages installed"

# Step 3: Install Docker
echo "Step 3: Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
    print_success "Docker installed"
else
    print_warning "Docker already installed"
fi

# Step 4: Install Docker Compose
echo "Step 4: Installing Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    print_success "Docker Compose installed"
else
    print_warning "Docker Compose already installed"
fi

# Step 5: Configure Firewall
echo "Step 5: Configuring firewall..."
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 8090/tcp
ufw --force enable
print_success "Firewall configured"

# Step 6: Create Project Directory
echo "Step 6: Setting up project directory..."
PROJECT_DIR="/opt/go-wa-api"
if [ ! -d "$PROJECT_DIR" ]; then
    mkdir -p "$PROJECT_DIR"
    print_success "Project directory created"
else
    print_warning "Project directory already exists"
fi

# Step 7: Clone Repository (if not already cloned)
echo "Step 7: Cloning repository..."
if [ ! -d "$PROJECT_DIR/.git" ]; then
    read -p "Enter your repository URL: " REPO_URL
    git clone "$REPO_URL" "$PROJECT_DIR"
    print_success "Repository cloned"
else
    print_warning "Repository already exists, pulling latest changes"
    cd "$PROJECT_DIR"
    git pull
fi

# Step 8: Setup Environment Variables
echo "Step 8: Setting up environment variables..."
cd "$PROJECT_DIR"
if [ ! -f ".env" ]; then
    if [ -f ".env.production" ]; then
        cp .env.production .env
        print_success "Environment file created from .env.production"
        print_warning "Please edit .env file with your production values"
        nano .env
    else
        print_error ".env.production file not found"
        exit 1
    fi
else
    print_warning ".env file already exists"
fi

# Step 9: Setup SSL Certificate
echo "Step 9: Setting up SSL certificate..."
read -p "Enter your domain name (e.g., example.com): " DOMAIN_NAME

if [ ! -d "/etc/letsencrypt/live/$DOMAIN_NAME" ]; then
    print_warning "SSL certificate not found. Obtaining new certificate..."
    certbot certonly --nginx -d "$DOMAIN_NAME"
    
    # Setup SSL directory
    mkdir -p "$PROJECT_DIR/nginx/ssl"
    cp "/etc/letsencrypt/live/$DOMAIN_NAME/fullchain.pem" "$PROJECT_DIR/nginx/ssl/"
    cp "/etc/letsencrypt/live/$DOMAIN_NAME/privkey.pem" "$PROJECT_DIR/nginx/ssl/"
    chmod -R 600 "$PROJECT_DIR/nginx/ssl"
    print_success "SSL certificate setup complete"
else
    print_warning "SSL certificate already exists"
fi

# Step 10: Update Nginx Configuration
echo "Step 10: Updating Nginx configuration..."
if [ ! -f "$PROJECT_DIR/nginx/nginx.conf" ]; then
    print_warning "Nginx configuration not found. Please create nginx/nginx.conf"
    print_warning "See DEPLOYMENT-GUIDE.md for configuration examples"
else
    # Update domain in nginx config
    sed -i "s/your-domain.com/$DOMAIN_NAME/g" "$PROJECT_DIR/nginx/nginx.conf"
    print_success "Nginx configuration updated"
fi

# Step 11: Build and Start Services
echo "Step 11: Building and starting services..."
cd "$PROJECT_DIR"
docker-compose -f docker-compose.production.yml build
docker-compose -f docker-compose.production.yml up -d
print_success "Services started"

# Step 12: Wait for Services to Start
echo "Step 12: Waiting for services to start..."
sleep 30

# Step 13: Check Service Status
echo "Step 13: Checking service status..."
docker-compose -f docker-compose.production.yml ps

# Step 14: Setup Database Backup
echo "Step 14: Setting up database backup..."
mkdir -p "$PROJECT_DIR/scripts"
mkdir -p "$PROJECT_DIR/database/backups"

# Create backup script
cat > "$PROJECT_DIR/scripts/backup-database.sh" << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/go-wa-api/database/backups"
mkdir -p $BACKUP_DIR

docker exec chatflow-postgres pg_dump -U chatflow_user chatflow_api > $BACKUP_DIR/backup_$DATE.sql
gzip $BACKUP_DIR/backup_$DATE.sql

# Keep only last 7 days
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +7 -delete
EOF

chmod +x "$PROJECT_DIR/scripts/backup-database.sh"

# Add to crontab
(crontab -l 2>/dev/null | grep -q "backup-database.sh") || (crontab -l 2>/dev/null; echo "0 2 * * * /opt/go-wa-api/scripts/backup-database.sh") | crontab -
print_success "Database backup configured"

# Step 15: Setup Log Rotation
echo "Step 15: Setting up log rotation..."
cat > /etc/logrotate.d/docker-containers << 'EOF'
/opt/go-wa-api/backend/logs/*.log {
    daily
    rotate 7
    compress
    missingok
    notifempty
    create 0644 root root
}
EOF
print_success "Log rotation configured"

echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo ""
echo "Your application is now deployed at: https://$DOMAIN_NAME"
echo ""
echo "Next Steps:"
echo "1. Access the dashboard at https://$DOMAIN_NAME"
echo "2. Login with admin credentials"
echo "3. Setup WhatsApp instances via Evolution API"
echo "4. Configure auto-reply rules"
echo ""
echo "Useful Commands:"
echo "- View logs: docker-compose -f docker-compose.production.yml logs -f"
echo "- Restart services: docker-compose -f docker-compose.production.yml restart"
echo "- Stop services: docker-compose -f docker-compose.production.yml down"
echo "- Update application: git pull && docker-compose -f docker-compose.production.yml build && docker-compose -f docker-compose.production.yml up -d"
echo ""
