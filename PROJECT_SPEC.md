# RaghuMayaShop — Build Spec (single source of truth)

You are building the RaghuMayaShop platform from the design docs in `~/workspace/user/files/`
(RaghuMayaShop-*.md, audit-logging.md, device-management.md, production-readiness-review.md,
referral-management.md, subscription-management.md, two-factor-auth.md).
**Read those docs first** — they are the requirements. This file adds coordination rules.

## 1. Monorepo layout (root: `~/workspace/raghumaya-shop/`)

```
raghumaya-shop/
  PROJECT_SPEC.md            <- this file
  package.json               <- npm workspaces: apps/*, packages/*
  .env.example
  .gitignore
  docker-compose.yml         <- postgres, redis, api, web (BACKEND agent owns)
  apps/api/                  <- BACKEND agent owns (all of it)
  apps/web/                  <- WEB agent owns (all of it)
  apps/mobile/               <- MOBILE agent owns (all of it)
  packages/shared/           <- BACKEND agent owns (shared TS types + zod schemas)
  docs/                      <- DOCS agent owns (all of it) + root README.md
```

**Ownership rule:** never write files outside your owned tree. If you need a contract
from another tree (e.g. API response shape), follow this spec, do not invent changes.

## 2. Stack (fixed — do not substitute)

- Backend: Node.js 20+ / TypeScript / **Express** (NestJS-style modular folders:
  `src/modules/<name>/{*.routes.ts,*.controller.ts,*.service.ts,*.repository.ts,*.validation.ts}`),
  Prisma ORM, PostgreSQL, Redis (cache + BullMQ), Zod validation, bcryptjs, jsonwebtoken,
  otplib (TOTP 2FA), pdfkit (invoice PDFs), helmet, cors, express-rate-limit.
- Web: Next.js 15 (App Router) / TypeScript / Tailwind CSS / shadcn-style UI components
  (hand-rolled `components/ui/*`, no shadcn CLI needed) / TanStack React Query / Recharts.
- Mobile: Expo SDK 52+ / TypeScript / Expo Router / TanStack React Query / Zustand.
- Shared: `packages/shared` exports TS types + Zod schemas + API endpoint constants.
- Ports: API `4000`, Web `3000`. API base path: `/api/v1`.

## 3. Global conventions (ALL agents)

- TypeScript strict everywhere. No `any` leaks in public APIs.
- Money: `Decimal` in Prisma, serialized as **string** in JSON. Never float math.
- Dates: ISO-8601 strings. Timestamps `createdAt/updatedAt/deletedAt` on all entities (soft delete).
- IDs: UUID v4 strings.
- List responses: `{ "data": [...], "meta": { "page": 1, "limit": 20, "total": N } }`.
- Errors: `{ "error": { "code": "SNAKE_CODE", "message": "human text" } }` with proper HTTP status.
- Pagination: `?page&limit` (default 20, max 100) on every list endpoint.
- Auth header: `Authorization: Bearer <accessToken>` (15 min TTL).
  Refresh: `POST /api/v1/auth/refresh` with `{ "refreshToken" }` → rotates, returns new pair.
  Refresh tokens stored hashed, revocable per device.
- Multi-tenancy: every business table has `shopId`. Shop context comes from the access
  token's `activeShopId` claim. `POST /api/v1/shops/switch { shopId }` issues a new access
  token with a different `activeShopId` (must be a shop the account is an ACTIVE member of).
- Roles: `SUPER_ADMIN, ADMIN (platform), OWNER, MANAGER, CASHIER, ACCOUNTANT, INVENTORY_STAFF, STAFF`.
  Platform admins use `/api/v1/admin/*`; shop users use the shop endpoints with
  permission checks from `shop_memberships` (see ShopPermission list in the multi-shop doc).
- Audit: every write endpoint appends an `audit_logs` row (actor, action, entityType,
  entityId, shopId, metadata, ipAddress).
- Idempotency: `Idempotency-Key` header honored on POST /billing/invoices, /payments,
  /subscriptions/change.
- **No stub/TODO code.** Every endpoint must run real logic against Prisma. Every page/screen
  must render real data from the API (with loading/error/empty states). Seed script must create
  a demo shop with products, customers, invoices.

## 4. Database — entities (Prisma schema, BACKEND agent)

Enums: AccountStatus, MembershipStatus, ShopPermission, UserRole, AdminRole,
InvoiceStatus (DRAFT/ISSUED/PARTIALLY_PAID/PAID/OVERDUE/CANCELLED), PaymentMode
(CASH/UPI/CARD/BANK_TRANSFER/CHEQUE), PaymentDirection (IN/OUT),
StockMovementType (IN/OUT/TRANSFER/ADJUSTMENT/PURCHASE/SALE),
SubscriptionStatus (TRIAL/ACTIVE/CANCELLED/EXPIRED), PlanCode (FREE/STARTER/PROFESSIONAL/ENTERPRISE).

Tables: accounts, admins, shops, shop_memberships, devices, refresh_tokens,
password_reset_tokens, verification_tokens, two_factor_settings (totp encrypted secret,
backup codes sha256), user_profile_changes,
categories (self-parent), brands, products, product_images, product_variants, product_batches,
warehouses, stock_levels, stock_movements, stock_transfers, stock_transfer_items,
suppliers, purchases, purchase_items,
customers, customer_reminders,
orders, order_items,
invoices, invoice_items, invoice_share_tokens, payments,
finance_categories, revenues, expenses, assets, liabilities,
subscription_plans, subscriptions, referral_codes, referrals, coupons,
notifications, sms_logs, audit_logs.

Key rules from docs:
- products: unique (shopId, sku), (shopId, barcode), (shopId, qrCode).
- product_batches: unique (shopId, productId, variantId, batchNumber); index (shopId, expiryDate).
- invoices: unique (shopId, invoiceNumber); invoice_number auto-generated `INV-{YYYY}-{seq}` per shop if not supplied.
- Ledger-first stock: stock_movements is immutable; stock_levels/products.currentStock recalculated.
- Customer ledger: invoice = debit, payment = credit, running balance.
- GST: line gross = qty*unitPrice; discount = gross*rate/100; taxable = gross-discount;
  gst = taxable*gstRate/100; intra-state → CGST+SGST split; inter-state → IGST.
- Seed: 1 platform super admin (admin@raghumaya.shop / Admin@123), 1 demo shop
  "Raghu Maya General Store", owner account (owner@demo.shop / Owner@123), ~25 products
  across 4 categories, 10 customers, 15 invoices with items/payments, finance entries,
  subscription PROFESSIONAL trial.

## 5. API endpoint catalog (BACKEND agent — implement ALL)

Auth `/api/v1/auth`: register-shop-owner, shop-users, login, logout, refresh,
change-password, forgot-password, reset-password, otp/request, otp/verify,
email/request-verification, email/verify, sms/request-verification, sms/verify,
admins (super admin only), 2fa/status, 2fa/methods (PATCH), 2fa/authenticator/setup,
2fa/authenticator/verify, 2fa/backup-codes/regenerate, 2fa/challenge/send, 2fa/challenge/verify,
devices (GET/DELETE /:id).

Shops `/api/v1/shops`: POST / (create, owner), GET / (my shops), GET /:id, PATCH /:id,
POST /switch {shopId}, memberships: GET /:id/members, POST /:id/members/invite,
PATCH /:id/members/:memberId, DELETE /:id/members/:memberId.

Inventory `/api/v1/inventory`: categories (POST/GET/PATCH/DELETE),
brands (POST/GET), products (POST/GET with filters+search, GET /lookup?type=barcode|qr&code=,
GET /:id, PATCH /:id, DELETE /:id), variants + batches nested in product payload.

Stock `/api/v1/stock`: warehouses (POST/GET/PATCH/DELETE), /in, /out, /transfers (POST),
/purchase-update, /sales-deduction, /levels, /movements, /alerts/low-stock,
/alerts/out-of-stock, /alerts/expiry?days=30, /recalculate.

Purchases `/api/v1/purchases`: POST/GET/GET /:id/PATCH (headers+items, auto stock in).

Billing `/api/v1/billing`: invoices (POST/GET/GET /:id/PATCH), POST /invoices/:id/pdf,
GET /invoices/:id/download, POST /invoices/:id/share, POST /invoices/:id/sms-link,
POST /invoices/:id/whatsapp-link; payments: POST /payments, GET /payments.

Customers `/api/v1/customers`: POST/GET/GET /:id/PATCH/DELETE, GET /due-payments,
GET /:id/history, GET /:id/purchases, GET /:id/ledger,
POST /:id/reminders/sms, POST /:id/reminders/whatsapp, GET /:id/reminders.

Finance `/api/v1/finance`: categories (POST/GET), revenues (POST/GET/PATCH/DELETE),
expenses (POST/GET/PATCH/DELETE), assets (POST/GET/PATCH/DELETE),
liabilities (POST/GET/PATCH/DELETE), GET /dashboard, GET /cash-flow,
GET /profit-loss, GET /revenue-analysis, GET /reports/monthly?year&month,
GET /reports/yearly?year, GET /reports/tax.

Analytics `/api/v1/analytics`: /dashboard, /sales/daily, /sales/weekly, /sales/monthly,
/top-products, /top-customers, /revenue-growth, /profit-margin, /inventory-value,
/outstanding-payments, /assets, /liabilities.

Subscriptions `/api/v1/subscriptions`: /plans, /current, /history, /limits,
/features/:feature, POST /change, POST /cancel, POST /admin/shops/:shopId/assign.

Referrals `/api/v1/referrals`: /validate/:code, POST /track, /dashboard, GET /,
/codes (GET/POST), POST /:id/reward, /coupons (GET/POST).

Audit `/api/v1/audit-logs` (GET with filters), GET /audit-logs/dashboard.

Notifications `/api/v1/notifications`: GET /, PATCH /:id/read, POST /:id/retry (admin).

Admin `/api/v1/admin`: /dashboard (platform metrics), /shops (GET/POST/PATCH/suspend/block/activate/delete),
/users (GET/PATCH/reset-password), /subscriptions (GET/assign), /approvals (GET/POST /:id/approve|reject),
/support/tickets (GET/POST/PATCH/assign/resolve/close), /reports/*, /settings (GET/PATCH),
/security/login-history, /security/devices.

Health: GET /health/live, GET /health/ready.

## 6. Web app (WEB agent) — Next.js 15, `apps/web`

Public: `/login`, `/verify-otp`, `/forgot-password`, `/reset-password/[token]`.
Platform admin shell (sidebar): `/dashboard`, `/shops`, `/shops/[id]`, `/users`,
`/subscriptions`, `/finance`, `/approvals`, `/support`, `/notifications`, `/reports`,
`/audit-logs`, `/settings`, `/security`.
Shop owner workspace: `/shop/dashboard` (analytics widgets+charts), `/shop/inventory`
(products table, barcode lookup, create/edit drawer), `/shop/stock` (levels, movements,
transfers, alerts), `/shop/billing` (invoice list, create invoice builder with GST math,
PDF view), `/shop/customers` (list, detail w/ ledger + due + reminders),
`/shop/finance` (dashboard, revenues/expenses/assets/liabilities, reports),
`/shop/team` (members), `/shop/settings` (shop switcher!).
Shared: auth context (JWT in memory + refresh), API client (`lib/api.ts`) hitting
`NEXT_PUBLIC_API_URL` (default http://localhost:4000/api/v1), ui components
(button, card, input, table, dialog, badge, skeleton, charts wrapper), React Query.
Middleware: protect all routes except public ones; role-gate admin vs shop.

## 7. Mobile app (MOBILE agent) — Expo, `apps/mobile`

Expo Router: `(auth)/login`, `(auth)/verify-otp`; `(tabs)/dashboard` (sales chart, KPI cards),
`(tabs)/inventory` (product list + search + barcode scan via expo-camera),
`(tabs)/billing` (invoice list + new invoice flow), `(tabs)/customers`,
`(tabs)/more` (stock alerts, finance summary, team, settings, shop switcher, logout).
Zustand auth store (secure store for tokens), TanStack Query API layer
(`EXPO_PUBLIC_API_URL`), offline banner, pull-to-refresh everywhere.

## 8. Docs (DOCS agent) — `docs/` + root `README.md`

README.md (root): overview, features, tech stack, monorepo map, quickstart (docker),
demo credentials, screenshots placeholders, links into docs/.
docs/: ARCHITECTURE.md, API_REFERENCE.md (every endpoint from §5 with example payloads),
DATABASE.md (ER description + table dictionary), DEPLOYMENT.md (docker, k8s notes, env vars),
SECURITY.md (auth flows, 2FA, RBAC, audit), USER_GUIDE.md (shop owner manual, Hinglish-friendly),
ADMIN_GUIDE.md (platform admin manual), MOBILE_GUIDE.md, TESTING.md, openapi.yaml
(full OpenAPI 3.1 for §5 — must match implemented routes), CHANGELOG.md.

## 9. Non-negotiables

- Everything in English UI copy (user writes Hinglish but product copy stays simple English).
- Never touch `~/workspace/user/files/` — read-only reference.
- Commit nothing to git unless asked (no git repo required).
- Report back: file tree created, how to run each app, what you verified (typecheck/test commands run + results).
