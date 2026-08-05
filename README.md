# FairShare

FairShare is a self-hosted, legally distinct shared-expense app inspired by the workflow category popularized by Splitwise. It is an Expo SDK 57 app for Android, iOS, tablets, and web, backed by a lightweight Fastify + SQLite server designed for AWS Lightsail.

## Included now

- Universal Expo app and responsive web build
- Registration/login with rotating sessions
- Groups, members, expenses, settlements, balances
- Equal, exact, percentage, shares, and adjustment split engine
- Deterministic debt simplification
- Offline queued writes and cursor-based synchronization
- Camera/gallery receipt OCR and line-item extraction
- Live currency-rate endpoint and multi-currency data model
- Recurring expenses, advanced search, category/month summaries, CSV export
- Bank-statement CSV transaction import with one-tap conversion into shared expenses
- Docker Compose deployment, host-Caddy snippet, CI, health checks, backups

See `docs/FEATURES.md`, `docs/PRO_PARITY.md`, and `docs/ARCHITECTURE.md`.

## Local development

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm dev:api
# In a second shell
EXPO_PUBLIC_API_URL=http://YOUR-LAN-IP:8080/api pnpm dev:app
```

For Expo Go on the Galaxy Tab, `EXPO_PUBLIC_API_URL` must use the computer/server LAN address, not `localhost`.

## Lightsail deployment

```bash
sudo mkdir -p /opt/stacks
cd /opt/stacks
git clone https://github.com/KingHacker9000/fairshare.git
cd fairshare
cp .env.example .env
chmod 600 .env
nano .env
./infra/deploy.sh
```

Add `infra/Caddyfile.example` to the host Caddy configuration, point the DNS A record for `fairshare.ashishajin.com` to the Lightsail static IP, reload Caddy, and verify `/health`.

## Termux setup on the S9 Ultra

```bash
pkg update -y && pkg install -y git nodejs-lts openssh gh
corepack enable
gh auth login
gh repo clone KingHacker9000/fairshare
cd fairshare
pnpm install
EXPO_PUBLIC_API_URL=https://fairshare.ashishajin.com/api pnpm --filter @fairshare/app dev
```

Android native compilation should use EAS Build or GitHub Actions; Expo Go and the web build can be developed directly from Termux.

## Security

Do not commit `.env`. Generate a unique `JWT_SECRET`, keep `.env` mode `600`, enable HTTPS before entering real financial data, and run `infra/backup.sh` from cron.
