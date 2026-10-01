# Changelog

All notable changes to the RaghuMayaShop platform are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows SemVer.

## [1.0.0] — 2026-09-28

Initial complete build of the RaghuMayaShop platform (monorepo: API + Web + Mobile + shared packages).

### Added

**Backend API** (`apps/api`, Express + TypeScript + Prisma + PostgreSQL + Redis/BullMQ)
- Modular domain layout: `src/modules/<name>/{*.routes,*.controller,*.service,*.repository,*.validation}`.
- **Auth**: register-shop-owner, shop-users, password login, JWT access (15 min) + rotating refresh tokens (hashed, per-device, revocable), change-password, forgot/reset password, OTP login, email/SMS verification, admin creation (super admin only).
- **2FA**: TOTP authenticator (encrypted secrets, QR setup), SMS/email OTP challenges, backup codes (SHA-256, single-use), challenge send/verify flow, method management.
- **Device management**: fingerprinting from device headers, device list, device removal revokes sessions.
- **Multi-shop**: `accounts` + `shop_memberships` (role, status, permissions), `activeShopId` token claim, shop switcher issuing new tokens, employee invites with role-based permission defaults (32 `ShopPermission` keys).
- **Inventory**: categories (nested), brands, products with images/variants/batches, SKU/barcode/QR uniqueness per shop, barcode/QR lookup, soft delete.
- **Stock**: warehouses, ledger-first `stock_movements` (immutable), stock in/out, inter-warehouse transfers, purchase updates, sales deductions, levels/movements views, low/out-of-stock and expiry alerts, recalculate repair.
- **Purchases**: purchase headers + items with automatic stock-in.
- **Billing**: GST invoices (intra-state CGST/SGST split, inter-state IGST), auto invoice numbers `INV-{YYYY}-{seq}` per shop, PDF generation (pdfkit), share tokens, SMS/WhatsApp invoice links, payments, status lifecycle DRAFT → ISSUED → PARTIALLY_PAID → PAID / OVERDUE / CANCELLED. `Idempotency-Key` honored.
- **Customers**: profiles, credit limits, outstanding balances, ledger (debit/credit/running balance), history, purchases, due-payment list, SMS/WhatsApp reminders with history.
- **Finance**: categories, revenues, expenses, assets, liabilities; dashboard (P&L, cash flow, tax CGST/SGST/IGST); monthly/yearly/tax reports.
- **Analytics**: dashboard widgets, sales daily/weekly/monthly, top products/customers, revenue growth (period-over-period), profit margin, inventory value, outstanding payments, assets, liabilities.
- **Subscriptions**: plans FREE/STARTER/PROFESSIONAL/ENTERPRISE (monthly/yearly, trials), change/cancel with limit checks, feature checks, admin plan assignment.
- **Referrals**: code creation/validation, tracking, conversion on registration, rewards, coupons, dashboard widgets.
- **Notifications**: in-app list, mark-read, admin retry.
- **Audit**: every write endpoint appends `audit_logs` (actor, action, entityType, entityId, shopId, old/new values, metadata, IP); filterable search + risk dashboard.
- **Admin platform** (`/api/v1/admin`): dashboard KPIs, shop lifecycle (create wizard backend, suspend/block/activate/delete), user management + password resets, subscriptions assign, approvals queue (profile/subscription/activation/deletion), support tickets (assign/resolve/close), notifications, async report exports (PDF/Excel/CSV), audit search, platform settings, login history + device management.
- **Health**: `/health/live`, `/health/ready`.

**Web dashboard** (`apps/web`, Next.js 15 + Tailwind + TanStack Query + Recharts)
- Public auth pages: login, verify-otp, forgot-password, reset-password/[token].
- Platform admin shell with sidebar: dashboard, shops, users, subscriptions, finance, approvals, support, notifications, reports, audit-logs, settings, security.
- Shop owner workspace: dashboard (analytics widgets + charts), inventory (table, barcode lookup, create/edit drawer), stock (levels, movements, transfers, alerts), billing (invoice list + builder with live GST math + PDF view), customers (detail with ledger + due + reminders), finance (dashboard + CRUD + reports), team (members), settings (shop switcher).
- Auth context (JWT in memory + refresh), `lib/api.ts` client, hand-rolled shadcn-style UI primitives, middleware route protection with role gating.

**Mobile owner app** (`apps/mobile`, Expo SDK 52 + Expo Router + Zustand + TanStack Query)
- `(auth)` login + OTP verify; `(tabs)` dashboard (KPI cards, sales chart), inventory (search + barcode scan via expo-camera), billing (list + new invoice flow), customers, more (stock alerts, finance summary, team, settings, shop switcher, logout).
- Secure token storage, offline banner, pull-to-refresh everywhere.

**Shared package** (`packages/shared`)
- TypeScript types, Zod schemas, and API endpoint constants shared by API/Web/Mobile.

**Documentation** (`docs/` + root `README.md`)
- Product overview, architecture with mermaid diagrams, full API reference with example payloads, database ER + table dictionary, deployment guide, security guide, shop-owner manual, platform-admin manual, mobile guide, testing guide, OpenAPI 3.1 spec (`openapi.yaml`), and this changelog.

### Security
- bcryptjs password hashing; TOTP secrets encrypted; tokens hashed at rest.
- Rate limiting on login/OTP/password-reset/SMS/invoice endpoints; Helmet; CORS allowlist; request IDs.
- Seed ships with documented demo credentials (`admin@raghumaya.shop` / `owner@demo.shop`) — rotate before any non-local deployment.

### Fixed / Notes
- Money serialized as strings (Decimal in DB); timestamps ISO-8601; UUID v4 IDs; soft delete via `deletedAt` on business entities.
- Invoice numbers auto-generated `INV-{YYYY}-{seq}` per shop when not supplied.
- Downgrades blocked when usage exceeds target plan limits.

[Unreleased]: n/a
[1.0.0]: 2026-09-28
