# EC2 Docker Deployment Guide

Deploy the Bank app to AWS EC2 using Docker Compose. This is the canonical production path for this repo.

## Architecture

```
Internet → :80 → [frontend container / nginx]
                  ├── / and /* → React static files
                  ├── /api/*   → [api container :8000]
                  └── /health  → [api container :8000]
                                      ↓
                            [postgres container]
                            [ollama container :11434]
```

## Prerequisites

- AWS account
- EC2 instance running Amazon Linux 2023
- Security group with inbound:
  - `22` (SSH) from your IP
  - `80` (HTTP) from anywhere

## Step 1: Launch EC2

1. AWS Console -> EC2 -> Launch Instance
2. AMI: Amazon Linux 2023
3. Instance type: `t2.micro` for testing, `t3.small+` for production
4. Attach security group rules above
5. Create/select key pair and launch

## Step 2: Connect to EC2

```bash
ssh -i your-key.pem ec2-user@your-ec2-public-ip
```

## Step 3: Install Docker + Git

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

## Step 6: Create Production Env File

Use the checked-in template so deploys are repeatable and do not depend on temporary shell exports.

```bash
cd /opt/bankapp
cp deploy/docker/.env.prod.example .env.prod
chmod 600 .env.prod
```

Generate secure secrets and inject them:

```bash
JWT_SECRET="$(openssl rand -hex 32)"
DB_PASSWORD="$(openssl rand -hex 16)"
sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|" .env.prod
sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=${DB_PASSWORD}|" .env.prod
```

## Step 7: Deploy

```bash
cd /opt/bankapp
sudo docker-compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

The production API container runs `alembic upgrade head` automatically before `uvicorn` starts, so schema changes are applied during container startup.

## Step 8: Pull Ollama Model (One Time)

The LLM classifier uses Ollama model `llama3.2:1b`.

```bash
sudo docker exec bank_ollama ollama pull llama3.2:1b
sudo docker exec bank_ollama ollama list
```

The model persists in the `ollama_data` volume, so you only need this once per volume.

## Step 9: Verify Deployment

Health check:

```bash
curl http://localhost/health
```

Expected:

```json
{"status":"healthy"}
```

Classifier check with a known gambling merchant:

```bash
curl -sS -X POST http://localhost/api/transactions \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"merchant":"DraftKings","description":"Weekly sports bet","amount":250}'
```

Expected in the response payload:

- `"flagged": true`
- `"category": "gambling"`

## Useful Commands

View all logs:

```bash
sudo docker-compose -f docker-compose.prod.yml logs -f
```

View API logs:

```bash
sudo docker-compose -f docker-compose.prod.yml logs -f api
```

Restart services:

```bash
sudo docker-compose -f docker-compose.prod.yml restart
```

Stop services:

```bash
sudo docker-compose -f docker-compose.prod.yml down
```

Update deployment (pull + rebuild):

```bash
cd /opt/bankapp
sudo git pull
sudo docker-compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

Update frontend only:

```bash
cd /opt/bankapp
sudo git pull
sudo docker-compose --env-file .env.prod -f docker-compose.prod.yml build frontend
sudo docker-compose --env-file .env.prod -f docker-compose.prod.yml up -d --no-deps frontend
```

Update backend (API) only:

```bash
cd /opt/bankapp
sudo git pull
sudo docker-compose --env-file .env.prod -f docker-compose.prod.yml build api
sudo docker-compose --env-file .env.prod -f docker-compose.prod.yml up -d --no-deps api
```

That API restart also reapplies pending Alembic migrations automatically on startup.

## Access from Browser

- Frontend: `http://your-ec2-public-ip/`
- API Docs: `http://your-ec2-public-ip/docs`
- Health: `http://your-ec2-public-ip/health`

## Troubleshooting

Container startup issues:

```bash
sudo docker-compose -f docker-compose.prod.yml logs
```

If `/api/*` returns `502`, inspect API logs first:

```bash
sudo docker-compose -f docker-compose.prod.yml logs -f api
```

Database connection test:

```bash
sudo docker-compose -f docker-compose.prod.yml exec postgres psql -U postgres -d bank -c "SELECT 1"
```

If LLM classification is not happening:

```bash
sudo docker-compose -f docker-compose.prod.yml logs -f api
sudo docker exec bank_ollama ollama list
```

Rebuild from scratch:

```bash
sudo docker-compose -f docker-compose.prod.yml down -v
sudo docker-compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

Check running containers:

```bash
sudo docker ps
```
