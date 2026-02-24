# Deployment Paths

Canonical production deployment in this repo is Docker Compose.

- Docker (canonical): `deploy/docker/README.md`
- Alternative API-only systemd + nginx path: `deploy/systemd-nginx/README.md`

The deploy assets are split by strategy to avoid mixing Docker and systemd/nginx files in one directory.
