# Quick Start Guide - Production Deployment

## Quick Deployment Steps

### 1. Run Automated Deployment Script
```bash
chmod +x deploy.sh
sudo ./deploy.sh
```

### 2. Configure Environment Variables
Edit `.env` file with your production values:
- Database password
- JWT secret
- API keys
- Domain name

### 3. Setup SSL Certificate
The script will prompt for your domain name and obtain SSL certificate automatically.

### 4. Access Application
Open browser: `https://your-domain.com`

## Common Commands

### View Logs
```bash
docker-compose -f docker-compose.production.yml logs -f
```

### Restart Services
```bash
docker-compose -f docker-compose.production.yml restart
```

### Stop Services
```bash
docker-compose -f docker-compose.production.yml down
```

### Update Application
```bash
chmod +x update.sh
./update.sh
```

### Backup Database
```bash
chmod +x backup-database.sh
./backup-database.sh
```

### Monitor Services
```bash
chmod +x monitor.sh
./monitor.sh
```

## Service URLs

- **Frontend:** https://your-domain.com
- **Backend API:** https://your-domain.com/api
- **WebSocket:** wss://your-domain.com/ws
- **Webhook:** https://your-domain.com/webhook/incoming
- **Evolution API 1:** http://your-domain.com:8081
- **Evolution API 2:** http://your-domain.com:8082

## Troubleshooting

### Services Not Starting
```bash
docker-compose -f docker-compose.production.yml logs
```

### Database Connection Issues
```bash
docker exec -it chatflow-postgres pg_isready -U chatflow_user
```

### WhatsApp Connection Issues
```bash
docker logs chatflow-api-1
docker restart chatflow-api-1
```

## Security Checklist

- [ ] Change all default passwords in .env
- [ ] Use strong passwords (16+ characters)
- [ ] SSL/TLS enabled
- [ ] Firewall configured
- [ ] Regular backups scheduled
- [ ] Monitoring enabled
- [ ] SSH access restricted

## Support

For detailed instructions, see `DEPLOYMENT-GUIDE.md`
