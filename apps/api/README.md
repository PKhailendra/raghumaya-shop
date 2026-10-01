# RaghuMayaShop API

Express + TypeScript + Prisma + PostgreSQL backend for RaghuMayaShop, a multi-shop
business-management platform (inventory, ledger-first stock, GST billing, customers,
finance, analytics, subscriptions, referrals, audit, notifications, platform admin).

## Quick start

```bash
cd apps/api
cp .env.example .env        # fill in DATABASE_URL, REDIS_URL, JWT_SECRET
npm install
npx prisma generate
npx prisma migrate dev      # or: npx prisma db push (no migration history yet)
npm run db:seed              # demo data (see credentials below)
npm run dev                  # API on :4000
npm run worker               # BullMQ worker (needs Redis; optional)
```

## Demo credentials (seeded)

| Role        | Email                | Password   |
|-------------|----------------------|------------|
| Super admin | admin@raghumaya.shop | Admin@123  |
| Demo owner  | owner@demo.shop      | Owner@123  |

Demo shop: **Raghu Maya General Store** — 25 products with stock ledger, 10 customers,
15 invoices (PAID / PARTIALLY_PAID / ISSUED), finance samples, PROFESSIONAL trial,
referral code `RAGHU10`.

## Conventions

- **TypeScript strict**, no `any` in service code.
- Every route does real Prisma work — no stubs.
- **Every write creates an `audit_logs` row** via `writeAudit()` (INFO / MEDIUM / HIGH).
- **Money is `Decimal` in Prisma and serialized as string in JSON** (global replacer in `app.ts`).
- Lists return `{ data, meta: { page, limit, total } }`.
- Errors go through the global handler → `{ error: { code, message } }`.
- Multi-tenant: shop context comes from the JWT `activeShopId` claim
  (`POST /api/v1/shops/switch` to change it).
- Stock is **ledger-first**: `stock_movements` are the source of truth;
  `stock_levels` + `product.currentStock` are derived caches.
- GST math: gross → discount → taxable → CGST/SGST (intra-state) or IGST (inter-state),
  rounded to 2 decimals per line.
- Idempotency: `POST` create routes accept `Idempotency-Key` (Redis or in-memory).
- Background jobs (SMS, PDF, reminders, notifications) run on BullMQ when Redis is
  available, otherwise inline via the in-process fallback (`src/jobs/fallback.ts`).

## Module layout

Each domain lives in `src/modules/<name>/` with `*.service.ts` (Prisma + audit),
`*.controller.ts` (req/res), `*.routes.ts` (auth + validation).

| Module          | Mount                     | Highlights                                    |
|-----------------|---------------------------|-----------------------------------------------|
| auth            | `/api/v1/auth`            | login, 2FA challenge, refresh rotation, OTP, devices, sessions, platform admins |
| shops           | `/api/v1/shops`           | CRUD, members, invite/roles, switch context    |
| inventory       | `/api/v1/inventory`       | categories, brands, products, variants, batches, barcode lookup |
| stock           | `/api/v1/stock`           | warehouses, ledger in/out, transfers, alerts  |
| purchases       | `/api/v1/purchases`       | supplier purchases → auto stock-in            |
| billing         | `/api/v1/billing`         | GST invoices, PDF gen/download, share links, SMS/WhatsApp, payments |
| customers       | `/api/v1/customers`       | CRUD, due list, ledger, history, reminders    |
| finance         | `/api/v1/finance`         | categories, revenue/expense/asset/liability, P&L, cash flow, tax report |
| analytics       | `/api/v1/analytics`       | dashboard + 12 metric endpoints                |
| subscriptions   | `/api/v1/subscriptions`   | plans, current, limits, features, change/cancel, admin assign |
| referrals       | `/api/v1/referrals`       | codes, tracking, dashboard, coupons           |
| audit           | `/api/v1/audit`           | filtered log list + dashboard                 |
| notifications   | `/api/v1/notifications`   | list, read, retry                             |
| admin           | `/api/v1/admin`           | platform dashboard, shops/users, plans, approvals, tickets, reports, settings, login history, devices |

## Verification

```bash
cd apps/api && npm install && npx prisma generate && npx tsc --noEmit
cd ../../packages/shared && npm install && npx tsc --noEmit
```
