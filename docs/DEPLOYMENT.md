# Deployment

## 1. Docker Compose deploy

`docker-compose.yml` defines: `postgres` (15), `redis` (7), `api` (built from `apps/api/Dockerfile`), `web` (built from `apps/web/Dockerfile`).

```bash
# First-time setup
cp .env.example .env          # fill in secrets (see §3)
docker compose up -d --build  # start postgres, redis, api, web

# Database migrations + demo seed (run once, or after pulls)
npm run db:migrate --workspace=apps/api
npm run db:seed    --workspace=apps/api

# Check health
curl http://localhost:4000/health/live    # liveness
curl http://localhost:4000/health/ready   # readiness (DB + Redis)
curl http://localhost:3000                # web dashboard

# View logs
docker compose logs -f api

# Stop / restart
docker compose down        # keep volumes (data survives)
docker compose up -d       # start again
```

Health checks are wired into Compose (`healthcheck` on `postgres`/`redis`; API depends on healthy DB/Redis).

### Without Docker (apps only)

Postgres 15 + Redis 7 must be reachable, then:

```bash
npm install
cp .env.example .env
npm run db:migrate --workspace=apps/api
npm run db:seed    --workspace=apps/api
npm run dev:api     # :4000
npm run dev:web     # :3000 (new terminal)
npm run dev:mobile  # Expo (new terminal)
```

## 2. Build & verify

```bash
npm run typecheck   # strict TS typecheck across workspaces
npm run build       # builds api + web + mobile
```

## 3. Environment variable reference

From `.env.example` — never commit real values.

| Variable | Used by | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | api | `postgresql://postgres:postgres@localhost:5432/raghumaya` | Postgres connection string (Prisma) |
| `REDIS_URL` | api | `redis://localhost:6379` | Redis for cache + BullMQ |
| `PORT` | api | `4000` | API listen port |
| `JWT_ACCESS_SECRET` | api | `change-me` | HS256 secret for access tokens (≥32 random chars in prod) |
| `JWT_REFRESH_SECRET` | api | `change-me` | HS256 secret for refresh tokens |
| `JWT_ACCESS_TTL` | api | `15m` | Access token lifetime |
| `TWO_FACTOR_TOTP_ENCRYPTION_KEY` | api | `change-me-32-byte-hex-key` | AES key encrypting TOTP secrets (32-byte hex) |
| `BCRYPT_ROUNDS` | api | `12` | bcrypt cost factor |
| `CORS_ORIGINS` | api | `http://localhost:3000` | Comma-separated allowed origins |
| `S3_ENDPOINT` | api | `` | S3-compatible endpoint (blank = provider default) |
| `S3_BUCKET` | api | `raghumaya` | Bucket for invoice PDFs, product images, exports |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | api | `` | Object storage credentials |
| `SMS_PROVIDER` | api | `console` | `console` (dev) / `twilio` / `msg91` / `sns` |
| `SMS_TWILIO_*` / `SMS_MSG91_*` / `SMS_SNS_*` | api | `` | Provider credentials (set the ones for your provider) |
| `EMAIL_PROVIDER` | api | `console` | `console` / `ses` / `sendgrid` |
| `EMAIL_SES_*` / `SENDGRID_API_KEY` | api | `` | Email provider credentials |
| `NEXT_PUBLIC_API_URL` | web | `http://localhost:4000/api/v1` | API base URL for the dashboard |
| `EXPO_PUBLIC_API_URL` | mobile | `http://localhost:4000/api/v1` | API base URL for the app |

Production additions (recommended, see §4): `DATABASE_READ_URL` (read replica), `SENTRY_DSN`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `NODE_ENV=production`.

## 4. Production checklist

From the production-readiness review — complete **before** launch:

- [ ] **Secrets manager**: all secrets (JWT, DB, S3, SMS/email, TOTP key) in a managed secret store (AWS Secrets Manager / Vault), rotated; no secrets in images or git.
- [ ] **HTTPS-only ingress**: TLS termination at LB/ingress; HSTS; redirect HTTP→HTTPS.
- [ ] **WAF**: rules for OWASP Top 10 + bot protection in front of the API; rate limits at edge for `/auth/*`.
- [ ] **Real SMS/email providers**: replace `console` adapters (MSG91/Twilio, SES/SendGrid); password-reset email templates; never log OTPs/reset tokens.
- [ ] **Backups**: automated daily Postgres backups + point-in-time recovery; test restores quarterly; S3 versioning for PDFs/images.
- [ ] **Read replicas**: Postgres read replica; route analytics + admin dashboards there.
- [ ] **Worker separation**: run BullMQ workers as a separate service/deployment so API replicas never double-execute SMS/PDF/export jobs.
- [ ] **Audit retention policy**: define retention (e.g. 7 years financial, 1 year auth) and archival to cold storage.
- [ ] **Monitoring**: Sentry (errors), OpenTelemetry traces, Prometheus/Grafana (latency, error rate, queue depth); alerting on 5xx, queue lag, disk.
- [ ] **Admin auth**: real login + 2FA flow; remove any demo/token-bypass patterns.
- [ ] **Billing webhooks**: payment-gateway webhooks for subscription renewals, dunning, tax invoices for SaaS billing, tenant quota middleware.
- [ ] **Idempotency**: keys honored on invoice/payment/purchase/subscription-change (implemented).
- [ ] **CORS**: production origin allowlist only.
- [ ] **Mobile**: production device headers, EAS build profiles, crash reporting, OTA channel strategy.

## 5. Scaling notes

- **Stateless API**: replicas behind the LB share Postgres + Redis; sessions live in DB/Redis, not memory.
- **Cache** (Redis, 30–120 s TTL): subscription plans, dashboard aggregates, static settings.
- **Pagination everywhere**; cursor pagination for large operational lists (shops, users, audit logs).
- **Async everything heavy**: SMS, PDF generation, report exports, analytics rollups run on BullMQ — API responses never wait on them.
- **DB**: monitor slow queries and table bloat; at 100k+ shops, monthly-partition `audit_logs`, `stock_movements`, `invoices`; add read replicas for analytics; consider OpenSearch for heavy product/customer search.
- **Unbounded exports**: never stream giant CSVs from an API worker — use export jobs with object-storage download links.

## 6. Health endpoints

- `GET /health/live` → `200 {"status":"ok"}` — process alive (LB liveness).
- `GET /health/ready` → `200 {"status":"ok","checks":{"database":"ok","redis":"ok"}}` or `503` — safe to route traffic (LB readiness).

## 7. Kubernetes / ECS notes

- Recommended runtime: Kubernetes or ECS/Fargate with managed Postgres (RDS), ElastiCache/MemoryDB, autoscaling on CPU + request latency, centralized logs (CloudWatch/Loki).
- Separate `Deployment` for API and for workers; `CronJob` for nightly aggregation/reconciliation.
- Rolling updates with `readinessProbe` on `/health/ready`; blue-green for risky releases.
- Feature flags for risky releases; keep migrations backward-compatible (expand → migrate → contract).
