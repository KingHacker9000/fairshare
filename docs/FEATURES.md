# FairShare feature scope

## Core expense sharing

- Accounts, secure sessions, groups, roles, member addition, and private group data.
- Expenses and repayments in integer minor units with equal, exact, percentage, shares, and adjustment splits.
- Per-group balances, deterministic debt simplification, suggested repayments, and payment recording.
- Categories, notes, comments/schema support, attachments/schema support, archive-ready data model, and activity search.
- Offline mutation queue with idempotency keys and server cursor-based change sync.

## Premium-grade tools

- Unlimited entries and groups; no advertising layer.
- Camera or gallery receipt scan with structured itemization through a configurable vision provider.
- Multi-currency expenses, live FX lookup, stored-rate schema, and conversion-ready API design.
- Recurring weekly, monthly, and yearly expense rules.
- Spending totals by category and month.
- CSV expense exports and bank-statement CSV transaction import, with imported purchases attachable to an expense.
- Default debt simplification with the ability to retain direct balances at the data layer.

## Production hardening included

- Scrypt password hashing, short-lived signed access tokens, rotating refresh tokens, rate limiting, CORS, request size limits, transaction boundaries, foreign keys, WAL mode, idempotent writes, health checks, resource limits, and database backup script.

## Remaining release integrations

- Live credit/debit-card transaction feeds require a supported open-banking provider and credentials; CSV transaction import is implemented now.
- Push notifications require an Expo project and APNs/FCM credentials.
- Email delivery for invitations requires a configured provider such as Resend; invite records and automatic joining are implemented.
- App-store payments are intentionally absent because all features are enabled in this self-hosted edition.
- OCR requires `OCR_PROVIDER=openai` plus a compatible API key; without it, manual receipt entry remains available.
