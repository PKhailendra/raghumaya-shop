# RaghuMayaShop

**Multi-tenant SaaS platform for shop management** — products, inventory & stock, GST billing, customers, finance, analytics, subscriptions, and platform administration. One codebase ships three clients: a **web dashboard** (shop owners + platform admins), a **mobile owner app** (Expo), and a **REST API** (Express + Prisma + PostgreSQL).

## Features

### Shop management (multi-tenant)
- One login account, many shops: memberships (`shop_memberships`) with per-shop role + permissions
- Shop switcher: `POST /shops/switch` re-issues a token scoped to `activeShopId`
- Granular `ShopPermission` matrix (32 keys): `INVENTORY_*`, `STOCK_*`, `CUSTOMER_*`, `ORDER_*`, `INVOICE_*`, `PAYMENT_*`, `FINANCE_*`, `EMPLOYEE_*`, `ANALYTICS_VIEW`, `SETTINGS_*`
- Employee invites with role defaults (OWNER / MANAGER / CASHIER / ACCOUNTANT / INVENTORY_STAFF / STAFF)

### Inventory & stock
- Categories (nested), brands, products with images, **variants**, **batches** (expiry/MFG), SKU/barcode/QR uniqueness per shop
- Barcode/QR lookup endpoint for POS scanning
- **Ledger-first stock**: immutable `stock_movements`; `stock_levels`, `products.currentStock` recalculated
- Warehouses, stock in/out, inter-warehouse transfers, purchase updates, sales deductions
- Alerts: low-stock, out-of-stock, batch expiry; manual `recalculate` repair job

### Billing & GST
- Invoices with line-level GST math (gross → discount → taxable → CGST/SGST split or IGST), auto invoice numbers `INV-{YYYY}-{seq}` per shop
- PDF generation (pdfkit), shareable links (tokens), SMS/WhatsApp invoice links
- Payments against invoices; status lifecycle DRAFT → ISSUED → PARTIALLY_PAID → PAID / OVERDUE / CANCELLED
- Idempotency-Key honored on invoice, payment, and subscription-change endpoints

### Customers
- Customer profiles with credit limits and running outstanding balance
- Full ledger (invoice = debit, payment = credit, running balance), purchase history
- Due-payment list; SMS/WhatsApp due reminders with history

### Finance
- Revenues, expenses, assets, liabilities with categories
- Dashboard (P&L, cash flow, tax payable CGST/SGST/IGST), monthly/yearly/tax reports

### Analytics
- Sales (daily/weekly/monthly), top products/customers, revenue growth (period-over-period), profit margin, inventory value, outstanding payments, assets, liabilities
- Read-replica friendly; response includes widget-ready dashboard payload

### SaaS / Subscriptions
- Plans: FREE / STARTER / PROFESSIONAL / ENTERPRISE, monthly/yearly cycles, trials
- Feature limits (`users`, `products`, `customers`, `invoicesPerMonth`, `storageMb`); downgrade blocked when usage exceeds limits
- Referrals: codes, tracking, rewards, coupons; registration auto-converts valid referral codes

### Platform admin
- Dashboard (shops/users/revenue/subscription metrics + charts)
- Shop lifecycle: create wizard, suspend/block/activate/delete, analytics
- User management, password resets, login & device history
- Approvals queue (profile changes, subscription changes, activations, deletions)
- Support tickets (assign/resolve/close), notifications center with retry
- Reports (async exports: PDF/Excel/CSV), audit logs, platform settings

### Security
- bcrypt password hashing; Argon2 supported by design
- JWT access tokens (15 min) + rotating refresh tokens (hashed, per-device, revocable)
- TOTP 2FA (encrypted secrets, backup codes), SMS/email OTP challenges
- Device fingerprinting & device management; admin trusted devices
- Rate limiting, Helmet, CORS allowlist, request IDs
- Full audit logging on every write endpoint

## Tech stack

| Layer | Technology |
|---|---|
| API | Node.js 20, TypeScript, Express (modular: routes/controller/service/repository/validation), Prisma, Zod |
| Database | PostgreSQL 15 (Prisma migrations); Redis (cache + BullMQ queues) |
| Auth | jsonwebtoken (rotation), bcryptjs, otplib (TOTP) |
| PDFs / SMS | pdfkit; pluggable SMS/email adapters (Twilio, MSG91, SES, SendGrid) |
| Web | Next.js 15 (App Router), TypeScript, Tailwind CSS, hand-rolled shadcn-style UI, TanStack React Query, Recharts |
| Mobile | Expo SDK 52, TypeScript, Expo Router, TanStack React Query, Zustand |
| Shared | `packages/shared`: TS types + Zod schemas + API endpoint constants |
| DevOps | Docker Compose (postgres, redis, api, web), health probes `/health/live`, `/health/ready` |

## Monorepo map

```
raghumaya-shop/
├── PROJECT_SPEC.md          # build contract (single source of truth for agents)
├── package.json             # npm workspaces: apps/*, packages/*
├── .env.example             # copy to .env
├── docker-compose.yml       # postgres + redis (+ api/web images)
├── apps/api/                # Express API, /api/v1
├── apps/web/                # Next.js 15 dashboard (admin + shop workspaces)
├── apps/mobile/             # Expo owner app
├── packages/shared/         # shared TS types, Zod schemas, endpoint constants
└── docs/                    # you are here
    ├── ARCHITECTURE.md
    ├── API_REFERENCE.md
    ├── DATABASE.md
    ├── DEPLOYMENT.md
    ├── SECURITY.md
    ├── USER_GUIDE.md
    ├── ADMIN_GUIDE.md
    ├── MOBILE_GUIDE.md
    ├── TESTING.md
    ├── openapi.yaml
    └── CHANGELOG.md
```

## Quickstart (Docker)

**Prereqs:** Docker Desktop (or Engine) with Compose v2, Node.js 20+, npm 10+.

```bash
# 1. Configure environment
cp .env.example .env        # then edit .env: set JWT secrets, DB passwords

# 2. Start everything (postgres, redis, api, web)
docker compose up -d

# 3. Run migrations + seed demo data
npm run db:migrate --workspace=apps/api
npm run db:seed    --workspace=apps/api
```

Demo seed creates: 1 platform super admin, 1 demo shop ("Raghu Maya General Store") with an owner, ~25 products across 4 categories, 10 customers, 15 invoices with items/payments, finance entries, and a PROFESSIONAL trial subscription.

### Demo credentials

| Role | Email | Password |
|---|---|---|
| Super admin | `admin@raghumaya.shop` | `Admin@123` |
| Demo shop owner | `owner@demo.shop` | `Owner@123` |

Change these immediately in any non-local environment.

### Local dev (without Docker for apps)

```bash
# API (needs postgres + redis running — start them via docker compose up -d postgres redis)
npm run dev:api

# Web dashboard
npm run dev:web

# Mobile app
npm run dev:mobile

# Typecheck everything
npm run typecheck
```

## Ports

| Service | Port | Notes |
|---|---|---|
| API | `4000` | Base path `/api/v1`; health at `/health/live`, `/health/ready` |
| Web | `3000` | `NEXT_PUBLIC_API_URL` → `http://localhost:4000/api/v1` |
| PostgreSQL | `5432` | |
| Redis | `6379` | |
| Mobile | Expo dev | `EXPO_PUBLIC_API_URL` → `http://localhost:4000/api/v1` |

## Documentation

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — system design, modules, request lifecycle, multi-tenancy
- [API_REFERENCE.md](docs/API_REFERENCE.md) — every endpoint with examples
- [openapi.yaml](docs/openapi.yaml) — machine-readable OpenAPI 3.1 spec
- [DATABASE.md](docs/DATABASE.md) — ER diagram + table dictionary
- [DEPLOYMENT.md](docs/DEPLOYMENT.md) — Docker, env vars, production checklist
- [SECURITY.md](docs/SECURITY.md) — auth flows, 2FA, RBAC, audit
- [USER_GUIDE.md](docs/USER_GUIDE.md) — shop-owner manual
- [ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md) — platform-admin manual
- [MOBILE_GUIDE.md](docs/MOBILE_GUIDE.md) — owner app guide
- [TESTING.md](docs/TESTING.md) — typechecks, builds, API test checklist
- [CHANGELOG.md](docs/CHANGELOG.md) — release notes

## Money, dates, IDs

- Money is `Decimal` in the database and serialized as **string** in JSON — never float math.
- Dates are ISO-8601 strings.
- IDs are UUID v4 strings.
- List responses paginate: `{"data":[...],"meta":{"page":1,"limit":20,"total":N}}`.
- Errors: `{"error":{"code":"SNAKE_CODE","message":"human text"}}`.
