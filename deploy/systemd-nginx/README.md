# EC2 Deployment Guide (Alternative: systemd + nginx)

This guide describes the non-Docker deployment path for the API only.
Canonical production deployment in this repo is `docker-compose.prod.yml`.

## Prerequisites

1. **EC2 Instance**: Amazon Linux 2023 or Ubuntu 22.04, t3.micro or larger
2. **RDS PostgreSQL**: Create an RDS instance in the same VPC
3. **Security Groups**:
   - EC2: Allow inbound 80 (HTTP), 443 (HTTPS), 22 (SSH)
   - RDS: Allow inbound 5432 from EC2 security group

## Quick Start

### 1. Launch EC2 Instance

```bash
# Connect to your instance
ssh -i your-key.pem ec2-user@your-ec2-ip
```

### 2. Clone and Setup

```bash
# Clone your repo (or upload files)
cd /opt
sudo git clone https://github.com/your-repo/bank.git bankapp
sudo chown -R $USER:$USER /opt/bankapp

# Run setup script
chmod +x /opt/bankapp/deploy/systemd-nginx/ec2-setup.sh
sudo /opt/bankapp/deploy/systemd-nginx/ec2-setup.sh
```

### 3. Configure Environment

```bash
# Create production .env
sudo cp /opt/bankapp/deploy/systemd-nginx/env.production.template /opt/bankapp/.env
sudo nano /opt/bankapp/.env

# Update with your RDS endpoint and a secure JWT secret:
# DATABASE_URL=postgresql+asyncpg://postgres:password@your-rds.amazonaws.com:5432/bank
# JWT_SECRET=$(openssl rand -hex 32)
```

### 4. Install Dependencies & Start

```bash
sudo -u bankapp /opt/bankapp/venv/bin/pip install -r /opt/bankapp/backend/requirements.txt
sudo -u bankapp /opt/bankapp/venv/bin/alembic -c /opt/bankapp/alembic.ini upgrade head
sudo systemctl start bankapp
sudo systemctl status bankapp
```

### 5. Verify

```bash
# Check health endpoint
curl http://localhost/health

# View logs
sudo tail -f /var/log/bankapp/app.log
```

## Subsequent Deployments

From your local machine:

```bash
cd deploy/systemd-nginx
chmod +x deploy.sh
./deploy.sh your-ec2-ip ~/.ssh/your-key.pem
```

## Adding HTTPS (Let's Encrypt)

```bash
# Install certbot
sudo dnf install -y certbot python3-certbot-nginx  # Amazon Linux
# or
sudo apt install -y certbot python3-certbot-nginx  # Ubuntu

# Get certificate (replace with your domain)
sudo certbot --nginx -d api.yourdomain.com

# Auto-renewal is configured automatically
```

## Useful Commands

```bash
# Service management
sudo systemctl start bankapp
sudo systemctl stop bankapp
sudo systemctl restart bankapp
sudo systemctl status bankapp

# View logs
sudo tail -f /var/log/bankapp/app.log
sudo tail -f /var/log/bankapp/error.log
sudo tail -f /var/log/nginx/bankapp_access.log

# Test nginx config
sudo nginx -t
sudo systemctl reload nginx
```

## Troubleshooting

**App won't start:**
```bash
# Check logs
sudo journalctl -u bankapp -n 50
sudo cat /var/log/bankapp/error.log

# Test manually
sudo -u bankapp /opt/bankapp/venv/bin/python -c "from backend.main import app; print('OK')"
```

**Database connection issues:**
```bash
# Test RDS connectivity
nc -zv your-rds-endpoint.amazonaws.com 5432

# Check security group allows EC2 -> RDS on port 5432
```

**502 Bad Gateway:**
```bash
# Check if app is running
sudo systemctl status bankapp
curl http://127.0.0.1:8000/health
```
