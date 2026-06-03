# Production Deployment Guide

## Overview
This guide provides step-by-step instructions for deploying the WhatsApp Auto-Reply System to a production server.

## Prerequisites

### Server Requirements
- **OS:** Ubuntu 20.04 LTS or higher / CentOS 8+ / Debian 11+
- **CPU:** 2+ cores
- **RAM:** 4GB minimum, 8GB recommended
- **Storage:** 50GB minimum, 100GB recommended
- **Network:** Public IP with proper DNS configuration

### Software Requirements
- **Docker:** 20.10+
- **Docker Compose:** 2.0+
- **Git:** 2.0+
- **SSL Certificate:** For HTTPS (Let's Encrypt recommended)
- **Domain Name:** Configured to point to server IP

## Deployment Steps

### Step 1: Server Setup

#### 1.1 Update System
```bash
sudo apt update && sudo apt upgrade -y
```

#### 1.2 Install Required Packages
```bash
sudo apt install -y curl wget git ufw fail2ban
```

#### 1.3 Install Docker
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
```

#### 1.4 Install Docker Compose
```bash
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

#### 1.5 Configure Firewall
```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 8090/tcp
sudo ufw enable
```

### Step 2: Clone Repository

#### 2.1 Clone Project
```bash
cd /opt
sudo git clone <your-repository-url> go-wa-api
cd go-wa-api
```

#### 2.2 Set Permissions
```bash
sudo chown -R $USER:$USER /opt/go-wa-api
chmod -R 755 /opt/go-wa-api
```

### Step 3: Environment Configuration

#### 3.1 Create Production Environment File
```bash
cd /opt/go-wa-api
cp .env.production .env
```

#### 3.2 Edit Environment Variables
```bash
nano .env
```

**Required Environment Variables:**
```env
# Database
POSTGRES_PASSWORD=your_secure_password_here
DB_HOST=postgres
DB_PORT=5432
DB_NAME=chatflow_api
DB_USER=chatflow_user

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# JWT Secret (generate with: openssl rand -base64 32)
JWT_SECRET=your_generated_jwt_secret

# ChatFlow API Key (generate with: openssl rand -base64 32)
CHATFLOW_API_KEY=your_generated_api_key

# Server URL (your domain name)
SERVER_URL=https://your-domain.com
WS_SERVER_URL=wss://your-domain.com

# Webhook Secret (generate with: openssl rand -base64 32)
WEBHOOK_SECRET=your_generated_webhook_secret
```

### Step 4: SSL Certificate Setup

#### 4.1 Install Certbot
```bash
sudo apt install -y certbot python3-certbot-nginx
```

#### 4.2 Obtain SSL Certificate
```bash
sudo certbot certonly --nginx -d your-domain.com
```

#### 4.3 Setup SSL Directory
```bash
sudo mkdir -p /opt/go-wa-api/nginx/ssl
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem /opt/go-wa-api/nginx/ssl/
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem /opt/go-wa-api/nginx/ssl/
sudo chown -R $USER:$USER /opt/go-wa-api/nginx/ssl
chmod -R 600 /opt/go-wa-api/nginx/ssl
```

### Step 5: Nginx Configuration

#### 5.1 Create Nginx Configuration
```bash
nano /opt/go-wa-api/nginx/nginx.conf
```

**Nginx Configuration:**
```nginx
events {
    worker_connections 1024;
}

http {
    upstream backend {
        server chatflow-api-1:3000;
        server chatflow-api-2:3000;
    }

    upstream api {
        server backend-api:8090;
    }

    server {
        listen 80;
        server_name your-domain.com;
        return 301 https://$server_name$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name your-domain.com;

        ssl_certificate /etc/nginx/ssl/fullchain.pem;
        ssl_certificate_key /etc/nginx/ssl/privkey.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;

        client_max_body_size 20M;

        location / {
            proxy_pass http://frontend:3000;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        location /api/ {
            proxy_pass http://api/api/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        location /webhook/incoming {
            proxy_pass http://backend/webhook/incoming;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        location /ws {
            proxy_pass http://api/ws;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        }
    }
}
```

### Step 6: Deploy Application

#### 6.1 Build and Start Services
```bash
cd /opt/go-wa-api
docker-compose -f docker-compose.production.yml build
docker-compose -f docker-compose.production.yml up -d
```

#### 6.2 Check Service Status
```bash
docker-compose -f docker-compose.production.yml ps
```

#### 6.3 View Logs
```bash
docker-compose -f docker-compose.production.yml logs -f
```

### Step 7: Database Initialization

#### 7.1 Check Database Status
```bash
docker exec -it chatflow-postgres psql -U chatflow_user -d chatflow_api -c "\dt"
```

#### 7.2 Run Migrations (if needed)
```bash
docker exec -it chatflow-backend npm run migrate
```

### Step 8: Verify Deployment

#### 8.1 Check Backend Health
```bash
curl https://your-domain.com/api/health
```

#### 8.2 Check Frontend
```bash
curl https://your-domain.com
```

#### 8.3 Check Webhook Endpoint
```bash
curl -X POST https://your-domain.com/webhook/incoming \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

## Post-Deployment Configuration

### 1. Setup WhatsApp Instances

#### 1.1 Access Evolution API
```bash
# Access chatflow-api-1
curl http://localhost:8081

# Access chatflow-api-2
curl http://localhost:8082
```

#### 1.2 Generate QR Code
- Navigate to Evolution API web interface
- Create new instance
- Scan QR code with WhatsApp

### 2. Configure Auto-Reply

#### 2.1 Access Dashboard
- Open browser: https://your-domain.com
- Login with admin credentials

#### 2.2 Setup Auto-Reply Config
- Navigate to Auto-Reply section
- Create new configuration
- Add trigger keywords
- Configure menu options

### 3. Setup Monitoring

#### 3.1 Install Monitoring Tools
```bash
# Install Prometheus (optional)
sudo apt install -y prometheus

# Install Grafana (optional)
sudo apt install -y grafana
```

#### 3.2 Configure Log Rotation
```bash
sudo nano /etc/logrotate.d/docker-containers
```

**Log Rotation Config:**
```
/opt/go-wa-api/backend/logs/*.log {
    daily
    rotate 7
    compress
    missingok
    notifempty
    create 0644 $USER $USER
}
```

### 4. Setup Backup Strategy

#### 4.1 Database Backup Script
```bash
nano /opt/go-wa-api/scripts/backup-database.sh
```

**Backup Script:**
```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/go-wa-api/database/backups"
mkdir -p $BACKUP_DIR

docker exec chatflow-postgres pg_dump -U chatflow_user chatflow_api > $BACKUP_DIR/backup_$DATE.sql
gzip $BACKUP_DIR/backup_$DATE.sql

# Keep only last 7 days
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +7 -delete
```

#### 4.2 Setup Cron Job
```bash
chmod +x /opt/go-wa-api/scripts/backup-database.sh
crontab -e
```

**Add to crontab:**
```
0 2 * * * /opt/go-wa-api/scripts/backup-database.sh
```

## Maintenance

### Update Application
```bash
cd /opt/go-wa-api
git pull
docker-compose -f docker-compose.production.yml build
docker-compose -f docker-compose.production.yml up -d
```

### Restart Services
```bash
docker-compose -f docker-compose.production.yml restart
```

### View Logs
```bash
# All services
docker-compose -f docker-compose.production.yml logs -f

# Specific service
docker-compose -f docker-compose.production.yml logs -f backend-api
```

### Stop Services
```bash
docker-compose -f docker-compose.production.yml down
```

## Troubleshooting

### Service Not Starting
```bash
# Check logs
docker-compose -f docker-compose.production.yml logs

# Check resource usage
docker stats

# Check disk space
df -h
```

### Database Connection Issues
```bash
# Check database status
docker exec -it chatflow-postgres pg_isready -U chatflow_user

# Test connection
docker exec -it chatflow-backend psql -h postgres -U chatflow_user -d chatflow_api
```

### WhatsApp Connection Issues
```bash
# Check Evolution API logs
docker logs chatflow-api-1

# Restart Evolution API
docker restart chatflow-api-1
```

## Security Best Practices

1. **Change all default passwords** in .env file
2. **Use strong passwords** (minimum 16 characters)
3. **Enable SSL/TLS** for all communications
4. **Configure firewall** to allow only necessary ports
5. **Regular updates** of system and Docker images
6. **Monitor logs** for suspicious activity
7. **Backup database** regularly
8. **Use fail2ban** for brute force protection
9. **Limit SSH access** to specific IPs
10. **Disable root login** via SSH

## Support

For issues and questions:
- Check logs: `docker-compose -f docker-compose.production.yml logs`
- Review documentation in `/docs` folder
- Check GitHub issues
