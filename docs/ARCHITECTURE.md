# Architecture

```text
Expo Android / iOS / Web
        |
        | HTTPS JSON + multipart
        v
Nginx web container (127.0.0.1:8092)
        | /api
        v
Fastify API container
        |
        v
SQLite WAL + local receipt storage (/data)
```

The app is a pnpm workspace. `@fairshare/shared` owns money and split invariants so the same deterministic calculations can be used on the client and server. The server is authoritative and stores all monetary values as integer minor units.

SQLite is deliberate for the current single Lightsail host: it minimizes memory and operational overhead while preserving ACID transactions. WAL, busy timeout, foreign keys, idempotency keys, online backups, and a single API writer make it appropriate for a small-to-medium private deployment. A later PostgreSQL migration can retain the API and client contracts.
