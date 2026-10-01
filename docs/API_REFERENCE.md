# API Reference

Base URL: `http://localhost:4000` — all endpoints are prefixed `/api/v1` unless noted.
Auth: `Authorization: Bearer <accessToken>` (15 min TTL). Refresh via `POST /auth/refresh`.

## Conventions

**List responses** — `{"data":[...],"meta":{"page":1,"limit":20,"total":N}}`.
Query: `?page=1&limit=20` (default 20, max 100) on every list endpoint.

**Errors** — `{"error":{"code":"SNAKE_CODE","message":"human text"}}` with proper HTTP status.
Common codes: `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403),
`NOT_FOUND` (404), `CONFLICT` (409), `RATE_LIMITED` (429), `INTERNAL_ERROR` (500).

**Idempotency** — send `Idempotency-Key: <uuid>` on `POST /billing/invoices`, `POST /billing/payments`,
`POST /purchases`, `POST /subscriptions/change`. Retries with the same key within 24 h return the original response.

**Money** — serialized as strings (`"1250.00"`). **Dates** — ISO-8601 strings. **IDs** — UUID v4.

**Actor header (informal)** — clients should send stable device headers for device management:
`x-device-id`, `x-device-name`, `x-device-type`, `x-device-platform`, `x-device-browser`.

---

## 1. Health

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health/live` | none | Liveness probe — returns 200 if process is up |
| GET | `/health/ready` | none | Readiness probe — checks DB + Redis |

```bash
curl http://localhost:4000/health/ready
# {"data":{"status":"ok","checks":{"database":"ok","redis":"ok"}}}
```

---

## 2. Auth (`/api/v1/auth`)

### POST /auth/register-shop-owner — Public
Registers a new shop and its owner account. Optionally converts a referral code.

Request:
```json
{
  "shopName": "Raghu Maya General Store",
  "fullName": "Raghu Prasad",
  "phone": "9999999999",
  "email": "owner@demo.shop",
  "password": "Owner@123",
  "gstNumber": "33AAAAA0000A1Z5",
  "city": "Chennai",
  "state": "Tamil Nadu",
  "referralCode": "RMS-ABCD1234"
}
```
Response `201`:
```json
{
  "data": {
    "accountId": "9f1c2d3e-…",
    "shopId": "7a8b9c0d-…",
    "accessToken": "eyJhbGciOi…",
    "refreshToken": "eyJhbGciOi…",
    "activeShopId": "7a8b9c0d-…",
    "shops": [{ "shopId": "7a8b9c0d-…", "shopName": "Raghu Maya General Store", "role": "OWNER", "status": "ACTIVE", "permissions": ["*"] }]
  }
}
```

### POST /auth/shop-users — Owner, Manager (INVOICE_… no; needs EMPLOYEE_CREATE)
Registers a staff account + membership for the active shop.

Request:
```json
{ "fullName": "Cashier User", "phone": "9999999998", "email": "cashier@example.com", "password": "Cashier@123", "role": "CASHIER" }
```
Response `201`: `{ "data": { "accountId": "…", "membershipId": "…", "role": "CASHIER" } }`

### POST /auth/login — Public
```json
{ "emailOrPhone": "owner@demo.shop", "password": "Owner@123" }
```
Response `200`:
```json
{
  "data": {
    "accessToken": "eyJhbGciOi…",
    "refreshToken": "eyJhbGciOi…",
    "activeShopId": "7a8b9c0d-…",
    "actorType": "SHOP_USER",
    "shops": [{ "shopId": "7a8b9c0d-…", "shopName": "Raghu Maya General Store", "role": "OWNER", "status": "ACTIVE", "permissions": ["*"] }]
  }
}
```
If 2FA is enabled, returns `200` with a challenge instead:
```json
{ "data": { "twoFactorRequired": true, "challengeToken": "ch_…", "methods": ["AUTHENTICATOR", "SMS"], "expiresAt": "2026-09-28T14:25:00.000Z" } }
```

### POST /auth/logout — Authenticated
```json
{ "refreshToken": "eyJhbGciOi…", "allDevices": false }
```
`201`…`200`: `{ "data": { "revoked": true } }`. `allDevices: true` revokes every active refresh token for the actor.

### POST /auth/refresh — Public
```json
{ "refreshToken": "eyJhbGciOi…" }
```
`200`: rotates the token (old one revoked) and returns a new `{ "data": { "accessToken": "…", "refreshToken": "…" } }`.

### POST /auth/change-password — Authenticated
```json
{ "currentPassword": "Owner@123", "newPassword": "NewOwner@456" }
```
`200`: `{ "data": { "changed": true } }`. All sessions are revoked (except optionally current device).

### POST /auth/forgot-password — Public
```json
{ "emailOrPhone": "owner@demo.shop" }
```
`200`: `{ "data": { "accepted": true } }` — always true to prevent account enumeration.

### POST /auth/reset-password — Public
```json
{ "token": "reset-token-from-email", "newPassword": "Reset@789" }
```
Token expires in 30 minutes. `200`: `{ "data": { "reset": true } }`; all refresh tokens revoked.

### POST /auth/otp/request — Public
```json
{ "emailOrPhone": "9999999999", "channel": "SMS" }
```
`200`: `{ "data": { "sent": true, "channel": "SMS", "expiresIn": 600 } }`

### POST /auth/otp/verify — Public
```json
{ "emailOrPhone": "9999999999", "code": "483920" }
```
`200`: consumes the code and returns `{ "data": { "accessToken": "…", "refreshToken": "…", "activeShopId": "…", "shops": […] } }`.

### POST /auth/email/request-verification — Authenticated
`200`: `{ "data": { "sent": true } }`

### POST /auth/email/verify — Public
```json
{ "code": "728194" }
```
`200`: `{ "data": { "verified": true } }`

### POST /auth/sms/request-verification — Authenticated
`200`: `{ "data": { "sent": true } }`

### POST /auth/sms/verify — Public
```json
{ "phone": "9999999999", "code": "551203" }
```
`200`: `{ "data": { "verified": true } }`

### POST /auth/admins — Super Admin only
Creates a platform admin account.
```json
{ "fullName": "Support Lead", "email": "support@raghumaya.shop", "password": "Support@123", "role": "ADMIN" }
```
`201`: `{ "data": { "adminId": "…", "email": "support@raghumaya.shop", "role": "ADMIN" } }`

### GET /auth/devices — Authenticated
Lists the actor's devices. `200`: `{ "data": [{ "id": "…", "deviceName": "Prasad's Phone", "deviceType": "mobile", "platform": "Android", "lastUsedAt": "…", "revokedAt": null }] }`

### DELETE /auth/devices/:id — Authenticated
Revokes all refresh tokens for that device. `200`: `{ "data": { "revoked": true } }`

---

## 3. Two-factor authentication (`/api/v1/auth/2fa`)

### GET /auth/2fa/status — Authenticated
`200`:
```json
{ "data": { "enabled": true, "methods": ["AUTHENTICATOR", "SMS"], "hasBackupCodes": true } }
```

### PATCH /auth/2fa/methods — Authenticated
```json
{ "methods": ["AUTHENTICATOR", "EMAIL"] }
```
`200`: `{ "data": { "methods": ["AUTHENTICATOR", "EMAIL"] } }`

### POST /auth/2fa/authenticator/setup — Authenticated
`200`: `{ "data": { "secret": "JBSWY3DPEHPK3PXP", "otpauthUrl": "otpauth://totp/RaghuMayaShop:owner@demo.shop?secret=JBSWY3DPEHPK3PXP&issuer=RaghuMayaShop", "qrDataUrl": "data:image/png;base64,…" } }`

### POST /auth/2fa/authenticator/verify — Authenticated
```json
{ "code": "123456" }
```
`200`: `{ "data": { "enabled": true, "backupCodes": ["a1b2-c3d4", "e5f6-g7h8", "…"] } }` — backup codes shown once.

### POST /auth/2fa/backup-codes/regenerate — Authenticated
`200`: `{ "data": { "backupCodes": ["…"] } }` — old codes invalidated.

### POST /auth/2fa/challenge/send — Public (challenge token)
```json
{ "challengeToken": "ch_…", "method": "SMS" }
```
`200`: `{ "data": { "sent": true } }`

### POST /auth/2fa/challenge/verify — Public (challenge token)
```json
{ "challengeToken": "ch_…", "method": "AUTHENTICATOR", "code": "123456" }
```
`200`: full login payload (access + refresh tokens, shops).

---

## 4. Shops (`/api/v1/shops`)

### POST /shops — Authenticated (any account)
Creates a shop + primary owner membership for the caller.
```json
{ "name": "Maya Fashion", "gstNumber": "33BBBBB1111B1Z6", "phone": "9888888888", "email": "maya@example.com", "city": "Coimbatore", "state": "Tamil Nadu", "country": "India" }
```
`201`: `{ "data": { "id": "…", "name": "Maya Fashion", "status": "ACTIVE", "createdAt": "…" } }`

### GET /shops — Authenticated
Returns only shops where the account has an ACTIVE membership. `200`: `{ "data": [{ "id": "…", "name": "…", "role": "OWNER", "isPrimaryOwner": true }] }`

### GET /shops/:id — Authenticated, member of shop
`200`: `{ "data": { "id": "…", "name": "…", "gstNumber": "…", "status": "ACTIVE", "address": {…} } }`

### PATCH /shops/:id — SHOP_UPDATE permission
```json
{ "name": "Maya Fashion & Textiles", "phone": "9888888888" }
```
`200`: updated shop.

### POST /shops/switch — Authenticated
```json
{ "shopId": "7a8b9c0d-…" }
```
`200`: `{ "data": { "accessToken": "…", "refreshToken": "…", "activeShopId": "7a8b9c0d-…", "role": "MANAGER", "permissions": ["INVENTORY_VIEW", "CUSTOMER_VIEW"] } }`

### GET /shops/:id/members — EMPLOYEE_VIEW
`200`: `{ "data": [{ "id": "…", "accountId": "…", "fullName": "…", "role": "CASHIER", "status": "ACTIVE", "joinedAt": "…" }], "meta": {…} }`

### POST /shops/:id/members/invite — EMPLOYEE_CREATE
```json
{ "fullName": "Cashier User", "phone": "9999999998", "email": "cashier@example.com", "role": "CASHIER", "permissions": ["CUSTOMER_VIEW", "ORDER_CREATE", "INVOICE_CREATE"] }
```
`201`: `{ "data": { "membershipId": "…", "role": "CASHIER", "status": "PENDING" } }`

### PATCH /shops/:id/members/:memberId — EMPLOYEE_UPDATE
```json
{ "role": "MANAGER", "status": "ACTIVE", "permissions": ["INVENTORY_VIEW"] }
```
`200`: updated membership. Cannot demote/remove the last active owner.

### DELETE /shops/:id/members/:memberId — EMPLOYEE_DELETE
`200`: `{ "data": { "removed": true } }` (soft delete; membership row kept with `deletedAt`).

---

## 5. Inventory (`/api/v1/inventory`) — shop users, INVENTORY_* permissions

### Categories

| Method | Path | Auth/perm | Description |
|---|---|---|---|
| POST | `/categories` | INVENTORY_CREATE | Create category |
| GET | `/categories` | INVENTORY_VIEW | List (tree when `?tree=true`) |
| PATCH | `/categories/:id` | INVENTORY_UPDATE | Rename / re-parent |
| DELETE | `/categories/:id` | INVENTORY_DELETE | Soft delete |

`POST /categories` body: `{ "name": "Groceries", "parentId": null, "sortOrder": 0 }`
→ `201`: `{ "data": { "id": "…", "shopId": "…", "name": "Groceries", "parentId": null } }`

### Brands

| Method | Path | Auth/perm | Description |
|---|---|---|---|
| POST | `/brands` | INVENTORY_CREATE | Create brand |
| GET | `/brands` | INVENTORY_VIEW | List brands |

`POST /brands` body: `{ "name": "Aachi" }` → `201`: `{ "data": { "id": "…", "name": "Aachi" } }`

### Products

| Method | Path | Auth/perm | Description |
|---|---|---|---|
| POST | `/products` | INVENTORY_CREATE | Create product (with images, variants, batches) |
| GET | `/products` | INVENTORY_VIEW | List; filters: `?search=&categoryId=&brandId=&isActive=&lowStock=` + pagination |
| GET | `/products/lookup?type=barcode\|qr&code=` | INVENTORY_VIEW | POS lookup by barcode or QR |
| GET | `/products/:id` | INVENTORY_VIEW | Detail with variants, batches, images |
| PATCH | `/products/:id` | INVENTORY_UPDATE | Update fields; variants/batches can be added |
| DELETE | `/products/:id` | INVENTORY_DELETE | Soft delete |

`POST /products` example:
```json
{
  "categoryId": "00000000-0000-0000-0000-000000000000",
  "brandId": "00000000-0000-0000-0000-000000000000",
  "name": "Premium Rice 25kg",
  "sku": "RICE-25KG",
  "barcode": "8900000000012",
  "qrCode": "RMS:RICE-25KG",
  "unit": "bag",
  "purchasePrice": "1100.00",
  "sellingPrice": "1250.00",
  "taxRate": "5.00",
  "currentStock": "40",
  "reorderLevel": "10",
  "images": [{ "url": "https://example.com/rice-front.jpg", "isPrimary": true, "sortOrder": 0 }],
  "variants": [{ "name": "10kg", "sku": "RICE-10KG", "barcode": "8900000000013", "sellingPrice": "520.00", "attributes": { "weight": "10kg" } }],
  "batches": [{ "batchNumber": "BATCH-JUN-2026", "expiryDate": "2026-12-31", "quantity": "40", "purchasePrice": "1100.00" }]
}
```
`201` returns the created product with nested images/variants/batches. SKU/barcode/QR must be unique per shop (`409 CONFLICT` otherwise).

`GET /products/lookup?type=barcode&code=8900000000012` → `200`: `{ "data": { "id": "…", "name": "Premium Rice 25kg", "sellingPrice": "1250.00", "currentStock": "40", "gstRate": "5" } }` (also matches variant barcodes).

---

## 6. Stock (`/api/v1/stock`) — shop users, STOCK_VIEW / STOCK_ADJUST

| Method | Path | Description |
|---|---|---|
| POST | `/warehouses` | Create warehouse — `{ "name": "Main Godown", "code": "GD-01", "address": "…", "isDefault": true }` |
| GET | `/warehouses` | List warehouses |
| PATCH | `/warehouses/:id` | Update warehouse |
| DELETE | `/warehouses/:id` | Soft delete warehouse |
| POST | `/in` | Stock in (creates/reuses batch by `batchNumber`) |
| POST | `/out` | Stock out (fails on insufficient stock) |
| POST | `/transfers` | Transfer between warehouses |
| POST | `/purchase-update` | Stock in from purchase workflow |
| POST | `/sales-deduction` | Stock out from sale/order workflow |
| GET | `/levels` | Current levels; `?warehouseId=&productId=&lowStock=` |
| GET | `/movements` | Immutable ledger; `?productId=&warehouseId=&type=&fromDate=&toDate=` |
| GET | `/alerts/low-stock` | Products/variants at or below reorder level |
| GET | `/alerts/out-of-stock` | Zero-quantity products/variants |
| GET | `/alerts/expiry?days=30` | Batches expiring within N days (default 30) |
| POST | `/recalculate` | Rebuild `stock_levels` / `currentStock` from the movement ledger |

`POST /stock/in` example:
```json
{
  "warehouseId": "00000000-0000-0000-0000-000000000000",
  "referenceType": "MANUAL",
  "note": "Monthly restock",
  "items": [
    { "productId": "00000000-0000-0000-0000-000000000000", "batchNumber": "BATCH-JUN-2026", "expiryDate": "2026-12-31", "quantity": "25", "unitCost": "100.00" }
  ]
}
```
`201`: `{ "data": { "movements": [{ "id": "…", "movementType": "IN", "quantity": "25", … }] } }`

`POST /stock/transfers` example:
```json
{
  "fromWarehouseId": "00000000-0000-0000-0000-000000000000",
  "toWarehouseId": "11111111-1111-1111-1111-111111111111",
  "note": "Festival stock shift",
  "items": [{ "productId": "22222222-2222-2222-2222-222222222222", "batchId": "33333333-3333-3333-3333-333333333333", "quantity": "5" }]
}
```
Creates paired `TRANSFER_OUT` + `TRANSFER_IN` movements.

---

## 7. Purchases (`/api/v1/purchases`) — shop users, INVENTORY_CREATE / STOCK_ADJUST

| Method | Path | Description |
|---|---|---|
| POST | `/purchases` | Create purchase (header + items); auto stock-in on completion |
| GET | `/purchases` | List; `?supplierId=&status=&fromDate=&toDate=` |
| GET | `/purchases/:id` | Detail with items |
| PATCH | `/purchases/:id` | Update header/items before receiving |

`POST /purchases` example:
```json
{
  "supplierId": "44444444-4444-4444-4444-444444444444",
  "purchaseNumber": "PO-2026-0042",
  "purchaseDate": "2026-09-20",
  "warehouseId": "00000000-0000-0000-0000-000000000000",
  "items": [
    { "productId": "00000000-0000-0000-0000-000000000000", "batchNumber": "BATCH-SEP-2026", "expiryDate": "2027-03-31", "quantity": "100", "unitCost": "1050.00" }
  ],
  "notes": "Festival season stock"
}
```
`201`: `{ "data": { "id": "…", "purchaseNumber": "PO-2026-0042", "totalAmount": "105000.00", "status": "RECEIVED" } }`

---

## 8. Billing (`/api/v1/billing`) — shop users, INVOICE_*/PAYMENT_* permissions

| Method | Path | Description |
|---|---|---|
| POST | `/invoices` | Create invoice (idempotent) |
| GET | `/invoices` | List; `?status=&customerId=&fromDate=&toDate=&search=` |
| GET | `/invoices/:id` | Detail with items + payments |
| PATCH | `/invoices/:id` | Edit draft/unpaid invoice |
| POST | `/invoices/:id/pdf` | Generate PDF (async queue; stores `pdfUrl`) |
| GET | `/invoices/:id/download` | Download PDF file |
| POST | `/invoices/:id/share` | Create shareable link |
| POST | `/invoices/:id/sms-link` | Queue SMS invoice link |
| POST | `/invoices/:id/whatsapp-link` | Create WhatsApp invoice link |
| POST | `/payments` | Record payment (idempotent) |
| GET | `/payments` | List payments; `?invoiceId=&mode=&fromDate=&toDate=` |

`POST /billing/invoices` example:
```json
{
  "customerId": "00000000-0000-0000-0000-000000000000",
  "status": "ISSUED",
  "issueDate": "2026-09-28",
  "dueDate": "2026-10-05",
  "placeOfSupply": "Tamil Nadu",
  "customerGstNumber": "33AAAAA0000A1Z5",
  "isInterState": false,
  "items": [
    { "productId": "11111111-1111-1111-1111-111111111111", "description": "Premium Rice 25kg", "hsnCode": "1006", "quantity": "2", "unitPrice": "1250.00", "discountRate": "5", "gstRate": "5" }
  ],
  "notes": "Thank you for your business.",
  "terms": "Payment due within 7 days."
}
```
GST math per line: `gross = qty × unitPrice`; `discount = gross × discountRate/100`; `taxable = gross − discount`; `gst = taxable × gstRate/100`. Intra-state (`isInterState: false`) splits into CGST/SGST; inter-state uses IGST. `201`:
```json
{
  "data": {
    "id": "…",
    "invoiceNumber": "INV-2026-0042",
    "status": "ISSUED",
    "subtotal": "2500.00",
    "discountTotal": "125.00",
    "taxableTotal": "2375.00",
    "cgstTotal": "59.38",
    "sgstTotal": "59.38",
    "taxTotal": "118.76",
    "totalAmount": "2493.76",
    "paidAmount": "0.00",
    "items": [{ "description": "Premium Rice 25kg", "hsnCode": "1006", "quantity": "2", "unitPrice": "1250.00", "discountRate": "5", "gstRate": "5", "lineTotal": "2493.76" }]
  }
}
```

`POST /billing/payments` example:
```json
{ "invoiceId": "…", "amount": "2493.76", "mode": "UPI", "transactionRef": "UPI-20260928-001", "paidAt": "2026-09-28T10:00:00.000Z", "note": "GPay" }
```
`201`: `{ "data": { "id": "…", "invoiceId": "…", "amount": "2493.76", "mode": "UPI", "status": "SUCCESS" } }`. Invoice status auto-updates (PARTIALLY_PAID/PAID); customer outstanding balance decreases.

`POST /billing/invoices/:id/share` → `201`: `{ "data": { "url": "https://shop.raghumaya.shop/i/abc123xyz", "expiresAt": "2026-10-05T00:00:00.000Z" } }`
`POST /billing/invoices/:id/sms-link` → `202`: `{ "data": { "queued": true } }`
`POST /billing/invoices/:id/whatsapp-link` → `201`: `{ "data": { "url": "https://wa.me/919999999999?text=…" } }`

---

## 9. Customers (`/api/v1/customers`) — shop users, CUSTOMER_* permissions

| Method | Path | Description |
|---|---|---|
| POST | `/customers` | Create customer |
| GET | `/customers` | List; `?search=&hasDue=` |
| GET | `/customers/due-payments` | Customers with unpaid invoices, with totals |
| GET | `/customers/:id` | Detail |
| PATCH | `/customers/:id` | Update |
| DELETE | `/customers/:id` | Soft delete |
| GET | `/customers/:id/history` | Invoices + payments timeline |
| GET | `/customers/:id/purchases` | Purchased items across invoices |
| GET | `/customers/:id/ledger` | Debit/credit entries with running balance |
| POST | `/customers/:id/reminders/sms` | Queue SMS due reminder |
| POST | `/customers/:id/reminders/whatsapp` | Create WhatsApp reminder link |
| GET | `/customers/:id/reminders` | Reminder history |

`POST /customers` body:
```json
{ "name": "Suresh Kumar", "phone": "9777777777", "email": "suresh@example.com", "address": "12 Main St, Chennai", "gstNumber": "33CCCCC2222C1Z7", "creditLimit": "50000.00" }
```
`201`: `{ "data": { "id": "…", "name": "Suresh Kumar", "creditLimit": "50000.00", "outstandingBalance": "0.00" } }`

`GET /customers/:id/ledger` → `200`:
```json
{
  "data": {
    "customerId": "…",
    "entries": [
      { "date": "2026-09-28", "type": "DEBIT", "reference": "INV-2026-0042", "debit": "2493.76", "credit": "0.00", "balance": "2493.76" },
      { "date": "2026-09-28", "type": "CREDIT", "reference": "PAY-UPI-20260928-001", "debit": "0.00", "credit": "2493.76", "balance": "0.00" }
    ],
    "outstandingBalance": "0.00"
  }
}
```
Ledger rule: invoice = debit, payment = credit, `balance = prev + debit − credit`.

`POST /customers/:id/reminders/sms` → `202`: `{ "data": { "queued": true, "channel": "SMS" } }`

---

## 10. Finance (`/api/v1/finance`) — shop users, FINANCE_* permissions (Owner/Manager/Accountant)

| Method | Path | Description |
|---|---|---|
| POST | `/categories` | Create income/expense category — `{ "name": "Rent", "type": "EXPENSE" }` |
| GET | `/categories` | List categories; `?type=EXPENSE` |
| POST | `/revenues` | Record manual income |
| GET | `/revenues` | List; `?fromDate=&toDate=&categoryId=` |
| PATCH | `/revenues/:id` | Update revenue |
| DELETE | `/revenues/:id` | Soft delete revenue |
| POST | `/expenses` | Record expense |
| GET | `/expenses` | List; `?fromDate=&toDate=&categoryId=` |
| PATCH | `/expenses/:id` | Update expense |
| DELETE | `/expenses/:id` | Soft delete expense |
| POST | `/assets` | Add asset |
| GET | `/assets` | List assets; `?status=` |
| PATCH | `/assets/:id` | Update asset |
| DELETE | `/assets/:id` | Soft delete asset |
| POST | `/liabilities` | Add liability |
| GET | `/liabilities` | List; `?status=` |
| PATCH | `/liabilities/:id` | Update liability |
| DELETE | `/liabilities/:id` | Soft delete liability |
| GET | `/dashboard` | Finance KPIs |
| GET | `/cash-flow` | Cash in/out series; `?fromDate=&toDate=` |
| GET | `/profit-loss` | P&L; `?fromDate=&toDate=` |
| GET | `/revenue-analysis` | Revenue by source/category |
| GET | `/reports/monthly?year=2026&month=9` | Monthly report |
| GET | `/reports/yearly?year=2026` | Yearly report |
| GET | `/reports/tax?fromDate=&toDate=` | Tax report (CGST/SGST/IGST payable) |

`POST /expenses` body:
```json
{ "categoryId": "…", "amount": "12000.00", "expenseDate": "2026-09-01", "vendorName": "City Rentals", "note": "September shop rent" }
```
`201`: `{ "data": { "id": "…", "amount": "12000.00", "expenseDate": "2026-09-01" } }`

`GET /finance/dashboard` → `200`:
```json
{
  "data": {
    "totalRevenue": "452300.00", "invoiceRevenue": "440300.00", "manualRevenue": "12000.00",
    "totalExpenses": "98000.00", "grossProfit": "354300.00",
    "cashIn": "430000.00", "cashOut": "90000.00", "netCashFlow": "340000.00",
    "assetValue": "850000.00", "outstandingLiabilities": "120000.00",
    "taxPayable": "45210.00", "cgst": "21000.00", "sgst": "21000.00", "igst": "3210.00"
  }
}
```

---

## 11. Analytics (`/api/v1/analytics`) — shop users, ANALYTICS_VIEW

| Method | Path | Description |
|---|---|---|
| GET | `/dashboard` | Widget-ready dashboard payload |
| GET | `/sales/daily` | Daily sales series; `?fromDate=&toDate=` |
| GET | `/sales/weekly` | Weekly sales series |
| GET | `/sales/monthly` | Monthly sales series |
| GET | `/top-products?limit=10` | Top products by qty & revenue |
| GET | `/top-customers?limit=10` | Top customers by invoice total |
| GET | `/revenue-growth` | Current vs previous equal-length period |
| GET | `/profit-margin` | Invoice revenue − expenses; `?fromDate=&toDate=` |
| GET | `/inventory-value` | Stock × purchase/selling price |
| GET | `/outstanding-payments` | Unpaid / partially-paid invoices |
| GET | `/assets` | Assets grouped by type/status |
| GET | `/liabilities` | Liabilities grouped by type/status |

`GET /analytics/dashboard` → `200`: `{ "data": { "widgets": [ { "key": "dailySales", "title": "Daily Sales", "type": "line", "data": […] }, … ] } }` (see ARCHITECTURE § for widget list).

---

## 12. Subscriptions (`/api/v1/subscriptions`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/plans` | Authenticated | List active plans (public pricing too) |
| GET | `/current` | Shop user (OWNER/MANAGER) | Current subscription + usage vs limits |
| GET | `/history` | Shop user | Subscription periods |
| GET | `/limits` | Shop user | Current plan limits + usage |
| GET | `/features/:feature` | Shop user | `{"data":{"feature":"bulk_invoice_pdf","allowed":true}}` |
| POST | `/change` | OWNER (idempotent) | Change plan |
| POST | `/cancel` | OWNER | Cancel (runs to end of period) |
| POST | `/admin/shops/:shopId/assign` | Platform admin (`subscriptions.assign`) | Admin assigns plan |

`POST /subscriptions/change` body:
```json
{ "planCode": "PROFESSIONAL", "billingCycle": "MONTHLY", "startTrial": true }
```
`200`: `{ "data": { "subscriptionId": "…", "planCode": "PROFESSIONAL", "status": "TRIAL", "trialEndsAt": "2026-10-12T00:00:00.000Z", "amount": "0.00" } }`
Downgrades are rejected (`409`) when current usage exceeds the target plan's limits.

---

## 13. Referrals (`/api/v1/referrals`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/validate/:code` | Public | Validate a referral code — `{ "data": { "valid": true, "code": "RMS-ABCD1234" } }` |
| POST | `/track` | Public | Track a referral click/signup — `{ "code": "RMS-ABCD1234", "phone": "9888888888" }` |
| GET | `/dashboard` | Shop user | Widgets: totals, rewards, by-status |
| GET | `/` | Shop user | List referrals |
| GET | `/codes` | Shop user | List own codes |
| POST | `/codes` | Shop user | Create code — `{ "code": "RMS-MAYA2026" }` (optional; auto-generated if omitted) |
| POST | `/:id/reward` | OWNER | Mark reward paid — `{ "rewardAmount": "500.00", "note": "… " }` |
| GET | `/coupons` | Shop user | List coupons |
| POST | `/coupons` | OWNER/Admin | Create coupon — `{ "code": "WELCOME500", "discountType": "FLAT", "discountValue": "500.00", "expiresAt": "2026-12-31" }` |

---

## 14. Notifications (`/api/v1/notifications`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Authenticated | List; `?unreadOnly=true` |
| PATCH | `/:id/read` | Authenticated | Mark read → `{ "data": { "read": true } }` |
| POST | `/:id/retry` | Platform admin (`notifications.send`) | Retry failed delivery |

`GET /notifications` → `200`: `{ "data": [{ "id": "…", "type": "SUBSCRIPTION", "title": "Trial ending soon", "message": "…", "isRead": false, "createdAt": "…" }], "meta": {…} }`

---

## 15. Audit logs (`/api/v1/audit-logs`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Authenticated | Search. Shop users see only their shop; platform admins see platform-wide. Filters: `?q=&entityType=&entityId=&action=&category=&severity=&actorType=&actorId=&ipAddress=&fromDate=&toDate=` |
| GET | `/dashboard` | Authenticated | Totals, auth events, by-category, by-severity, top actions, recent high-risk events |

`GET /audit-logs?q=INVOICE_CREATED&severity=INFO` → `200`: `{ "data": [{ "id": "…", "action": "INVOICE_CREATED", "entityType": "Invoice", "entityId": "…", "actorId": "…", "ipAddress": "49.205.x.x", "createdAt": "…" }], "meta": {…} }`

---

## 16. Platform admin (`/api/v1/admin`) — Admin actors only (permission keys shown)

### Dashboard
- `GET /admin/dashboard` (`dashboard.read`) → `{ "data": { "shops": { "total": 1240, "active": 1180, "inactive": 40, "blocked": 20, "newToday": 6, "newThisMonth": 148 }, "revenue": { "daily": "42000.00", "weekly": "280000.00", "monthly": "1150000.00", "yearly": "13200000.00" }, "users": { "total": 5100, "active": 4900, "suspended": 60 }, "subscriptions": { "free": 300, "starter": 420, "professional": 380, "enterprise": 80 }, "finance": { "totalPlatformRevenue": "13200000.00", "pendingPayments": "85000.00", "subscriptionRenewals": 96 } } }`

### Shops
| Method | Path | Permission |
|---|---|---|
| GET | `/admin/shops` (`?status=&search=`) | `shops.read` |
| POST | `/admin/shops` (create wizard backend: shop + owner + temp password + subscription, sends SMS/email) | `shops.create` |
| GET | `/admin/shops/:shopId` | `shops.read` |
| PATCH | `/admin/shops/:shopId` | `shops.update` |
| POST | `/admin/shops/:shopId/suspend` | `shops.suspend` |
| POST | `/admin/shops/:shopId/block` | `shops.block` |
| POST | `/admin/shops/:shopId/activate` | `shops.activate` |
| DELETE | `/admin/shops/:shopId` | `shops.delete` (Super Admin; soft delete) |
| GET | `/admin/shops/:shopId/analytics` | `shops.read` |

`POST /admin/shops` body:
```json
{ "shopName": "New Shop", "ownerName": "Owner", "ownerPhone": "9888888888", "ownerEmail": "o@example.com", "gstNumber": "…", "city": "…", "state": "…", "planCode": "STARTER" }
```
`201`: `{ "data": { "shopId": "…", "ownerAccountId": "…", "temporaryPassword": "Tmp#4821", "subscriptionId": "…" } }` — temporary password is returned once and sent via SMS/email.

### Users
| Method | Path | Permission |
|---|---|---|
| GET | `/admin/users` (`?status=&role=&search=`) | `users.read` |
| PATCH | `/admin/users/:userId` | `users.update` |
| POST | `/admin/users/:userId/reset-password` | `users.reset_password` |

`POST /admin/users/:userId/reset-password` → `200`: `{ "data": { "temporaryPassword": "Tmp#9910", "sentVia": ["SMS", "EMAIL"] } }`

### Subscriptions
| Method | Path | Permission |
|---|---|---|
| GET | `/admin/subscriptions` (`?status=&planCode=`) | `subscriptions.read` |
| POST | `/admin/subscriptions/assign` — `{ "shopId": "…", "planCode": "PROFESSIONAL", "billingCycle": "YEARLY" }` | `subscriptions.assign` |

### Approvals
| Method | Path | Permission |
|---|---|---|
| GET | `/admin/approvals` (`?type=&status=PENDING`) | `approvals.read` |
| POST | `/admin/approvals/:id/approve` — `{ "reviewerComment": "…" }` | `approvals.approve` |
| POST | `/admin/approvals/:id/reject` — `{ "reason": "…" }` | `approvals.reject` |

Approval types: `PROFILE_CHANGE`, `SUBSCRIPTION_CHANGE`, `SHOP_ACTIVATION`, `DELETE_REQUEST`. Approve applies the change and audits; reject notifies the requester.

### Support tickets
| Method | Path | Permission |
|---|---|---|
| GET | `/admin/support/tickets` (`?status=&priority=&search=`) | `support.read` |
| POST | `/admin/support/tickets` — `{ "shopId": "…", "subject": "…", "description": "…", "priority": "HIGH" }` | `support.create` |
| PATCH | `/admin/support/tickets/:ticketId` | `support.assign` |
| POST | `/admin/support/tickets/:ticketId/assign` — `{ "assignedToId": "…" }` | `support.assign` |
| POST | `/admin/support/tickets/:ticketId/resolve` — `{ "resolution": "…" }` | `support.resolve` |
| POST | `/admin/support/tickets/:ticketId/close` | `support.close` |

Ticket states: OPEN → ASSIGNED → WAITING_ON_CUSTOMER → RESOLVED → CLOSED.

### Reports
| Method | Path | Permission |
|---|---|---|
| GET | `/admin/reports/:type` (`?format=pdf&fromDate=&toDate=`) — `shops`, `revenue`, `users`, `subscriptions`, `audit` | `reports.read` |
| POST | `/admin/reports/exports` — `{ "reportType": "revenue", "format": "CSV", "filters": { "fromDate": "2026-09-01", "toDate": "2026-09-30" } }` | `reports.export` |
| GET | `/admin/reports/exports/:jobId` | `reports.read` |

Exports run async (BullMQ) and return a job: `202`: `{ "data": { "jobId": "…", "status": "QUEUED" } }`; poll `GET …/exports/:jobId` for `fileUrl`.

### Settings
| Method | Path | Permission |
|---|---|---|
| GET | `/admin/settings` | `settings.read` |
| PATCH | `/admin/settings` — `{ "key": "sms.provider", "value": "msg91" }` | `settings.update` (Super Admin) |

### Security
| Method | Path | Permission |
|---|---|---|
| GET | `/admin/security/login-history` (`?email=&adminId=&success=`) | `security.read` / `login_history.read` |
| GET | `/admin/security/devices` (`?adminId=`) | `security.read` / `devices.manage` |
