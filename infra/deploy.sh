#!/usr/bin/env bash
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/stacks/fairshare}"
REPO_URL="${REPO_URL:-https://github.com/KingHacker9000/fairshare.git}"
BRANCH="${BRANCH:-main}"

if [[ ! -d "$APP_DIR/.git" ]]; then
  sudo mkdir -p "$APP_DIR"
  sudo chown "$USER":"$USER" "$APP_DIR"
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

if [[ ! -f .env ]]; then
  cp .env.example .env
  chmod 600 .env
  python3 - <<'PY'
from pathlib import Path
import secrets
p=Path('.env')
s=p.read_text().replace('replace-with-at-least-32-random-bytes', secrets.token_urlsafe(48))
p.write_text(s)
PY
  echo "Created .env. Review APP_ORIGIN and OCR settings before public launch."
fi

docker compose -f infra/docker-compose.yml build --pull
docker compose -f infra/docker-compose.yml up -d --remove-orphans
docker compose -f infra/docker-compose.yml ps
curl --fail --silent http://127.0.0.1:8092/health >/dev/null
echo "FairShare is healthy on 127.0.0.1:8092"
