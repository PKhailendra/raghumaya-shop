# Architecture

## 1. System overview

RaghuMayaShop is a **multi-tenant SaaS platform** that lets shop owners run their whole business from one place: product catalog, stock, GST invoices, customers & due collection, finance, and analytics. Platform admins run the SaaS business itself: tenant shops, users, subscriptions, approvals, support, and audit.

The backend is a **modular monolith**: one Express service, strict module boundaries (`routes → controller → service → repository`), versioned REST API (`/api/v1`). PostgreSQL is the system of record; Redis powers cache and BullMQ background jobs; S3-compatible storage holds invoice PDFs, product images, and export files.

## 2. Component diagram

```mermaid
flowchart TB
    subgraph Clients["Clients"]
        OwnerApp["Owner Mobile App<br/>(Expo)"]
        ShopWeb["Shop Workspace Web<br/>(Next.js)"]
        AdminWeb["Platform Admin Web<br/>(Next.js)"]
    end

    subgraph Edge["Edge"]
        WAF["WAF / Rate Limiter"]
        LB["API Gateway / Load Balancer"]
    end

    subgraph API["Backend API — Node.js 20 / Express / TypeScript"]
        Auth["Auth + 2FA + Devices"]
        Shops["Shops + Memberships"]
        Inv["Inventory"]
        Stock["Stock (ledger)"]
        Bill["Billing (GST)"]
        Cust["Customers"]
        Fin["Finance"]
        Analy["Analytics"]
        Subs["Subscriptions + Referrals"]
        Admin["Platform Admin"]
        Audit["Audit Logs"]
        Notify["Notifications / SMS queue"]
    end

    subgraph Data["Data & Jobs"]
        PG[("PostgreSQL<br/>Primary")]
        Replica[("PostgreSQL<br/>Read Replica")]
        Redis[("Redis<br/>Cache + BullMQ")]
        S3[("S3 Object Storage<br/>(PDFs, images, exports)")]
    end

    subgraph External["External"]
        SMS["SMS Provider<br/>(Twilio / MSG91 / SNS)"]
        Email["Email Provider<br/>(SES / SendGrid)"]
    end

    OwnerApp --> WAF
    ShopWeb --> WAF
    AdminWeb --> WAF
    WAF --> LB
    LB --> API

    API --> PG
    API --> Redis
    API --> S3
    Analy --> Replica
    Notify --> Redis
    Redis --> SMS
    Notify --> Email
    Subs --> Email
```

**Web and mobile talk to the same REST API.** There is no separate admin API process; platform admins call `/api/v1/admin/*` with an admin-scoped token, shop users call the shop endpoints with a membership-scoped token (`activeShopId` claim).

## 3. Backend module breakdown

`apps/api/src/modules/<name>/` — each module owns:

| File | Responsibility |
|---|---|
| `*.routes.ts` | Route registration: auth middleware, permission guards, Zod validation |
| `*.controller.ts` | HTTP only: parse input, call service, format response |
| `*.service.ts` | Business logic: GST math, stock ledger, subscription rules |
| `*.repository.ts` | Prisma data access; tenant scoping enforced here |
| `*.validation.ts` | Zod schemas for body/query/params |

Shared cross-cutting code lives in `src/common/`: `authenticate`, `authorize` (RBAC), `requireShopPermission`, `audit` writer, `idempotency`, `rateLimit`, `errorHandler`, `requestLogger`, Prisma client, Redis/BullMQ setup, SMS/email adapters, S3 client.

Modules and their domain:

- **auth** — login, register, OTP, email/SMS verification, password reset, 2FA, devices, admin creation
- **shops** — create/list/update shops, switch active shop, memberships (invite/update/remove)
- **inventory** — categories, brands, products, variants, batches, images, barcode/QR lookup
- **stock** — warehouses, ledger movements, transfers, alerts, recalculate
- **purchases** — supplier purchases (header + items), auto stock-in
- **billing** — invoices, GST engine, payments, PDF, share tokens, SMS/WhatsApp links
- **customers** — profiles, ledger, history, due payments, reminders
- **finance** — categories, revenues, expenses, assets, liabilities, reports
- **analytics** — shop KPI dashboards and breakdowns (read-replica friendly)
- **subscriptions** — plans, shop subscription lifecycle, limits/features checks, admin assignment
- **referrals** — codes, tracking, conversion, rewards, coupons
- **notifications** — in-app notifications, SMS logs, retry
- **audit** — audit log search + dashboard
- **admin** — platform dashboard, shops, users, subscriptions, approvals, support tickets, reports/exports, settings, security
- **health** — `/health/live`, `/health/ready`

## 4. Request lifecycle

```mermaid
sequenceDiagram
    participant C as Client (Web/Mobile)
    participant MW as Middleware chain
    participant R as Controller
    participant S as Service
    participant P as Repository (Prisma)
    participant Q as Queue (BullMQ)
    participant DB as PostgreSQL

    C->>MW: HTTPS + Authorization: Bearer <JWT>
    MW->>MW: helmet, CORS, rate-limit, request-id, JSON parse
    MW->>MW: authenticate → req.actor {accountId, membershipId, shopId, role, permissions}
    MW->>MW: authorize / requireShopPermission(...)
    MW->>MW: validateRequest (Zod: params/query/body)
    MW->>R: parsed request
    R->>S: business call
    S->>P: prisma query (scoped by shopId)
    P->>DB: SQL
    DB-->>P: rows
    P-->>S: entities
    S->>S: domain rules (GST math, stock ledger, subscription limits)
    S->>Q: enqueue background work (SMS, PDF, exports) when needed
    S->>P: write audit_logs row
    P-->>S: ok
    S-->>R: result
    R-->>C: JSON {data} / {data, meta} or {error}
```

Every business repository method takes the actor's `shopId` — tenant isolation is enforced in the data layer, never trusted from client input.

## 5. Multi-tenancy model

```mermaid
erDiagram
    ACCOUNT ||--o{ SHOP_MEMBERSHIP : has
    SHOP ||--o{ SHOP_MEMBERSHIP : has
    ACCOUNT {
        uuid id PK
        string phone
        string email
    }
    SHOP_MEMBERSHIP {
        uuid id PK
        uuid shopId FK
        uuid accountId FK
        enum role
        enum status
        boolean isPrimaryOwner
        jsonb permissions
    }
    SHOP {
        uuid id PK
        string name
        string gstNumber
        enum status
    }
```

- One **account** (global login identity) can hold **memberships** in many shops.
- Each shop request carries the token's **`activeShopId`** claim. The `requireShopPermission` middleware re-loads the membership (`accountId + shopId`, `status = ACTIVE`) and resolves effective permissions: `OWNER` gets `["*"]`; others get role defaults merged with per-membership overrides.
- Switching shops: `POST /api/v1/shops/switch {shopId}` verifies an ACTIVE membership exists, then issues a fresh access + refresh token pair scoped to that shop.
- Platform admins are separate identities (`admins` table, `AdminRole`): `SUPER_ADMIN, ADMIN, SUPPORT_EXECUTIVE, FINANCE_MANAGER, READ_ONLY_AUDITOR`, each with permission keys like `shops.read`, `approvals.approve`. They never carry `activeShopId`; admin endpoints check `actorType = ADMIN` + permission keys.
- Legacy note: an older `shop_users` model existed; identity now lives in `accounts` + `shop_memberships` (see DATABASE.md).

## 6. Data flow: sale → invoice → stock → finance

```mermaid
flowchart LR
    Sale["POS sale<br/>(mobile/web)"] --> Inv["POST /billing/invoices"]
    Inv --> GST["GST engine:<br/>gross → discount → taxable<br/>→ CGST/SGST or IGST"]
    GST --> DBI[("invoices + invoice_items")]
    Inv --> Pay["POST /billing/payments"]
    Pay --> DBP[("payments")]
    Inv --> Stk["stock ledger"]
    Stk --> SM[("stock_movements<br/>type = SALE")]
    SM --> Lvl[("stock_levels +<br/>products.currentStock")]
    Inv --> Cust["customer ledger"]
    Cust --> CL[("customers.outstandingBalance<br/>invoice=debit, payment=credit")]
    Inv --> Q["BullMQ queue"]
    Q --> PDF["invoice PDF (S3)"]
    Q --> SMS["SMS / WhatsApp link"]
    DBI --> Fin["finance reports"]
    DBP --> Fin
    Fin --> PL["profit-loss, cash-flow,<br/>tax report (CGST/SGST/IGST)"]
```

Key invariants:

1. **Ledger-first stock**: `stock_movements` rows are immutable; quantities are derived. The `recalculate` endpoint can rebuild derived state from the ledger.
2. **Customer ledger**: outstanding balance = Σ(invoice totals) − Σ(payments). Running balance per entry for the detail view.
3. **Invoice immutability**: issued invoices are edited only via PATCH with audit; financial records use reversals, not deletion.
4. **Audit**: each of these steps writes an `audit_logs` row with actor, action, entity, shop, old/new values, IP.

## 7. Background jobs (BullMQ)

| Queue | Jobs |
|---|---|
| `sms` | invoice-link SMS, due-payment reminders, shop-created credentials |
| `pdf` | invoice PDF generation → upload to S3, store `pdfUrl` |
| `exports` | async report exports (PDF/Excel/CSV) → S3 with expiring download URL |
| `notifications` | in-app + email/push fan-out |
| `analytics` | heavy aggregation rollups |

In production, workers run as a **separate service** from the API (see DEPLOYMENT.md) so scaled API replicas never double-execute jobs.

## 8. Scaling posture

- Phase 1 (this release): modular monolith, one Postgres primary, Redis for cache/queues, async jobs for SMS/PDF/exports.
- Phase 2: read replicas for analytics/admin dashboards, Redis caching of dashboard aggregates (30–120 s TTL), materialized daily summary tables, cursor pagination on large lists.
- Phase 3: split only high-throughput modules (notifications, analytics, billing) into services; partition hot tables (`audit_logs`, `stock_movements`, `invoices`) by month; optional OpenSearch for heavy product/customer search.
