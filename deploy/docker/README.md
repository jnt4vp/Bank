# EC2 Docker Deployment Guide

Deploy the Bank app to AWS EC2 using Docker. This is the canonical production path for this repo.

## Prerequisites

- AWS account
- EC2 instance running Amazon Linux 2023
- Security group allowing inbound ports: 22 (SSH), 80 (HTTP)

## Architecture

```
Internet → port 80 → [frontend container / nginx]
                           ├── / and /* → serves React static files
                           ├── /api/*   → proxies to [api container :8000]
                           └── /health  → proxies to [api container :8000]
                                              ↓
                                    [postgres container]
```

## Step 1: Launch EC2 Instance

1. Go to AWS Console → EC2 → Launch Instance
2. Select **Amazon Linux 2023 AMI**
3. Choose instance type (t2.micro for testing, t3.small+ for production)
4. Configure security group:
   - SSH (port 22) from your IP
   - HTTP (port 80) from anywhere
5. Create or select a key pair
6. Launch instance

## Step 2: Connect to EC2

```bash
ssh -i your-key.pem ec2-user@your-ec2-public-ip
```

## Step 3: Install Docker

```bash
sudo dnf install -y docker git
sudo systemctl enable docker
sudo systemctl start docker
```

## Step 4: Install Docker Compose

```bash
cd /tmp
sudo curl -SL -O https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-linux-x86_64
sudo mv docker-compose-linux-x86_64 /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
docker-compose --version
```

## Step 5: Clone Repository

```bash
sudo git clone https://github.com/jnt4vp/Bank.git /opt/bankapp
sudo git config --global --add safe.directory /opt/bankapp
cd /opt/bankapp
```

## Step 6: Set Environment Variables and Deploy

```bash
cd /opt/bankapp
export JWT_SECRET=$(openssl rand -hex 32)
export DB_PASSWORD=$(openssl rand -hex 16)
sudo -E docker-compose -f docker-compose.prod.yml up -d --build
```

If you use `sudo` for any later `docker-compose up` command that recreates containers, keep `-E` so `JWT_SECRET` is preserved.

## Step 7: Verify Deployment

```bash
curl http://localhost/health
```

Expected response:
```json
{"status":"healthy"}
```

## Useful Commands

### View logs
```bash
sudo docker-compose -f docker-compose.prod.yml logs -f
```

### View API logs only
```bash
sudo docker-compose -f docker-compose.prod.yml logs -f api
```

### Restart services
```bash
sudo docker-compose -f docker-compose.prod.yml restart
```

### Stop services
```bash
sudo docker-compose -f docker-compose.prod.yml down
```

### Update deployment (pull latest code + rebuild all)
```bash
cd /opt/bankapp
sudo git pull
sudo -E docker-compose -f docker-compose.prod.yml up -d --build
```

### Update frontend only
```bash
cd /opt/bankapp
sudo git pull
sudo -E docker-compose -f docker-compose.prod.yml build frontend
sudo -E docker-compose -f docker-compose.prod.yml up -d --no-deps frontend
```

### Update backend (API) only
```bash
cd /opt/bankapp
sudo git pull
sudo -E docker-compose -f docker-compose.prod.yml build api
sudo -E docker-compose -f docker-compose.prod.yml up -d --no-deps api
```

## Test the API

### Register a user
```bash
curl -X POST http://localhost/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"password123"}'
```

### Login
```bash
curl -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

### Get current user (use token from login response)
```bash
curl http://localhost/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## Access from Browser

- Frontend: `http://your-ec2-public-ip/`
- API Docs: `http://your-ec2-public-ip/docs`
- Health Check: `http://your-ec2-public-ip/health`

## Troubleshooting

### Container not starting
```bash
sudo docker-compose -f docker-compose.prod.yml logs
```

If the frontend loads but `/api/*` returns `502`, check API logs first:
```bash
sudo docker-compose -f docker-compose.prod.yml logs -f api
```
Common causes are missing `JWT_SECRET` (often `sudo` without `-E`) or a failed migration/database connection.

### Database connection issues
```bash
sudo docker-compose -f docker-compose.prod.yml exec postgres psql -U postgres -d bank -c "SELECT 1"
```

### Rebuild from scratch
```bash
sudo docker-compose -f docker-compose.prod.yml down -v
sudo -E docker-compose -f docker-compose.prod.yml up -d --build
```

### Check running containers
```bash
sudo docker ps
```
