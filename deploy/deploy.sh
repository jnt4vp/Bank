#!/bin/bash
# Deploy script - run from your local machine
# Usage: ./deploy.sh <ec2-host> [key-file]

set -e

EC2_HOST=$1
KEY_FILE=${2:-"~/.ssh/id_rsa"}
REMOTE_USER="ec2-user"  # or "ubuntu" for Ubuntu AMI
APP_DIR="/opt/bankapp"

if [ -z "$EC2_HOST" ]; then
    echo "Usage: ./deploy.sh <ec2-host> [key-file]"
    echo "Example: ./deploy.sh ec2-12-34-56-78.compute-1.amazonaws.com ~/.ssh/mykey.pem"
    exit 1
fi

SSH_CMD="ssh -i $KEY_FILE $REMOTE_USER@$EC2_HOST"
SCP_CMD="scp -i $KEY_FILE"

echo "=== Deploying to $EC2_HOST ==="

# Create tarball of the app (excluding unnecessary files)
echo "Creating deployment package..."
cd "$(dirname "$0")/.."
tar --exclude='venv' \
    --exclude='__pycache__' \
    --exclude='.env' \
    --exclude='*.pyc' \
    --exclude='.git' \
    --exclude='node_modules' \
    -czf /tmp/bankapp.tar.gz .

# Upload to EC2
echo "Uploading to EC2..."
$SCP_CMD /tmp/bankapp.tar.gz $REMOTE_USER@$EC2_HOST:/tmp/

# Deploy on EC2
echo "Deploying on EC2..."
$SSH_CMD << 'ENDSSH'
set -e

# Extract app
sudo mkdir -p /opt/bankapp
sudo tar -xzf /tmp/bankapp.tar.gz -C /opt/bankapp
sudo chown -R bankapp:bankapp /opt/bankapp

# Install/update dependencies
sudo -u bankapp /opt/bankapp/venv/bin/pip install -r /opt/bankapp/backend/requirements.txt -q

# Apply database migrations
sudo -u bankapp /opt/bankapp/venv/bin/alembic -c /opt/bankapp/alembic.ini upgrade head

# Restart service
sudo systemctl restart bankapp

# Wait and check status
sleep 2
sudo systemctl status bankapp --no-pager

echo ""
echo "Deployment complete!"
ENDSSH

# Cleanup
rm /tmp/bankapp.tar.gz

echo "=== Deployment finished ==="
