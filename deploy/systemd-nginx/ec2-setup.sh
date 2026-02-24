#!/bin/bash
# EC2 Setup Script for Bank API
# Run this once on a fresh Amazon Linux 2023 or Ubuntu 22.04 instance

set -e

echo "=== Bank API EC2 Setup ==="

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
fi

# Install dependencies based on OS
if [ "$OS" == "amzn" ]; then
    echo "Installing dependencies (Amazon Linux)..."
    sudo dnf update -y
    sudo dnf install -y python3.11 python3.11-pip nginx git
    PYTHON=python3.11
elif [ "$OS" == "ubuntu" ]; then
    echo "Installing dependencies (Ubuntu)..."
    sudo apt update
    sudo apt install -y python3.11 python3.11-venv python3-pip nginx git
    PYTHON=python3.11
else
    echo "Unsupported OS: $OS"
    exit 1
fi

# Create app user
echo "Creating app user..."
sudo useradd -m -s /bin/bash bankapp || true

# Create app directory
echo "Setting up app directory..."
sudo mkdir -p /opt/bankapp
sudo chown bankapp:bankapp /opt/bankapp

# Create virtual environment
echo "Creating virtual environment..."
sudo -u bankapp $PYTHON -m venv /opt/bankapp/venv

# Create log directory
sudo mkdir -p /var/log/bankapp
sudo chown bankapp:bankapp /var/log/bankapp

# Install systemd service
echo "Installing systemd service..."
sudo cp /opt/bankapp/deploy/bankapp.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable bankapp

# Install nginx config
echo "Configuring nginx..."
sudo cp /opt/bankapp/deploy/nginx.conf /etc/nginx/conf.d/bankapp.conf
sudo rm -f /etc/nginx/conf.d/default.conf 2>/dev/null || true
sudo rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. Copy your code to /opt/bankapp/"
echo "2. Create /opt/bankapp/.env with production values"
echo "3. Run: sudo -u bankapp /opt/bankapp/venv/bin/pip install -r /opt/bankapp/backend/requirements.txt"
echo "4. Run: sudo systemctl start bankapp"
echo "5. Check status: sudo systemctl status bankapp"
