# Testing

## 1. Static checks

Run from the repo root (`~/workspace/raghumaya-shop`):

```bash
npm run typecheck   # strict TypeScript typecheck in every workspace (api, web, mobile, shared)
npm run build       # production builds for all apps
```

Both must pass with zero errors before any release. There are no stub/TODO implementations — every endpoint executes real logic against Prisma, and every screen renders real API data (with loading/error/empty states).

## 2. OpenAPI validation

```bash
python3 -c "import yaml; yaml.safe_load(open('docs/openapi.yaml')); print('openapi.yaml: valid YAML')"
```

(`pip install pyyaml` if needed.) The spec must cover every endpoint in PROJECT_SPEC §5 — compare against `docs/API_REFERENCE.md`.

## 3. Seed verification

After `npm run db:seed --workspace=apps/api`, verify:

1. Login as super admin: `POST /api/v1/auth/login` with `admin@raghumaya.shop` / `Admin@123` → expect `200` + tokens.
2. Login as demo owner: `owner@demo.shop` / `Owner@123` → expect `activeShopId` + `shops[]` with one shop ("Raghu Maya General Store").
3. `GET /api/v1/inventory/products` (owner token) → ~25 products across 4 categories.
4. `GET /api/v1/customers` → 10 customers.
5. `GET /api/v1/billing/invoices` → 15 invoices; pick one and `GET /billing/invoices/:id` → items + payments present, totals consistent.
6. `GET /api/v1/subscriptions/current` → PROFESSIONAL, status TRIAL.

## 4. Manual API test checklist (curl)

Set a base and log in once:

```bash
API=http://localhost:4000/api/v1
LOGIN=$(curl -s -X POST $API/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"emailOrPhone":"owner@demo.shop","password":"Owner@123"}')
TOKEN=$(echo $LOGIN | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['accessToken'])")
AUTH="Authorization: Bearer $TOKEN"
```

### Auth & security
```bash
# Refresh rotation
REFRESH=$(echo $LOGIN | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['refreshToken'])")
curl -s -X POST $API/auth/refresh -H 'Content-Type: application/json' -d "{\"refreshToken\":\"$REFRESH\"}"

# 2FA status + device list
curl -s $API/auth/2fa/status -H "$AUTH"
curl -s $API/auth/devices -H "$AUTH"

# Wrong password rejected with 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST $API/auth/login \
  -H 'Content-Type: application/json' -d '{"emailOrPhone":"owner@demo.shop","password":"wrong"}'
```

### Auth → invoice end-to-end
```bash
# 1. Create a customer
CUST=$(curl -s -X POST $API/customers -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"name":"Test Customer","phone":"9000000001","creditLimit":"10000.00"}')
CUST_ID=$(echo $CUST | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['id'])")

# 2. Create a product
PROD=$(curl -s -X POST $API/inventory/products -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"name":"Test Soap","sku":"SOAP-TEST","unit":"piece","purchasePrice":"20.00","sellingPrice":"30.00","taxRate":"18.00","currentStock":"100","reorderLevel":"10"}')
PROD_ID=$(echo $PROD | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['id'])")

# 3. Create an invoice (idempotent) — intra-state: CGST+SGST split
INV=$(curl -s -X POST $API/billing/invoices -H "$AUTH" -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: test-inv-001' \
  -d "{\"customerId\":\"$CUST_ID\",\"status\":\"ISSUED\",\"issueDate\":\"2026-09-28\",\"isInterState\":false,
       \"items\":[{\"productId\":\"$PROD_ID\",\"description\":\"Test Soap\",\"hsnCode\":\"3401\",\"quantity\":\"10\",\"unitPrice\":\"30.00\",\"discountRate\":\"10\",\"gstRate\":\"18\"}]}")
echo $INV | python3 -m json.tool
# expect: subtotal 300.00, discountTotal 30.00, taxableTotal 270.00,
#         cgstTotal 24.30, sgstTotal 24.30, totalAmount 318.60
INV_ID=$(echo $INV | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['id'])")

# 4. Idempotency: same key returns the same invoice, no duplicate
curl -s -X POST $API/billing/invoices -H "$AUTH" -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: test-inv-001' -d '{}' | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['invoiceNumber'])"

# 5. Record a partial payment
curl -s -X POST $API/billing/payments -H "$AUTH" -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: test-pay-001' \
  -d "{\"invoiceId\":\"$INV_ID\",\"amount\":\"100.00\",\"mode\":\"UPI\",\"transactionRef\":\"TEST-UPI-1\"}"

# 6. Invoice should now be PARTIALLY_PAID with paidAmount 100.00
curl -s $API/billing/invoices/$INV_ID -H "$AUTH" | python3 -c \
  "import json,sys; d=json.load(sys.stdin)['data']; print(d['status'], d['paidAmount'], d['totalAmount'])"

# 7. Customer ledger: debit 318.60, credit 100.00, balance 218.60
curl -s $API/customers/$CUST_ID/ledger -H "$AUTH" | python3 -m json.tool

# 8. Stock was deducted by 10 (SALE movement)
curl -s "$API/stock/movements?productId=$PROD_ID&type=SALE" -H "$AUTH" | python3 -m json.tool
```

### Stock & alerts
```bash
# Low stock alert picks up a product at/below reorder level
curl -s $API/stock/alerts/low-stock -H "$AUTH"
# Expiry alerts (batches expiring within 30 days)
curl -s "$API/stock/alerts/expiry?days=30" -H "$AUTH"
# Rebuild derived stock from the immutable ledger
curl -s -X POST $API/stock/recalculate -H "$AUTH"
```

### RBAC negative tests
```bash
# Cashier token must NOT access finance (expect 403)
# 1) create a cashier via owner token, 2) login as cashier, 3) GET /finance/dashboard
curl -s -o /dev/null -w "%{http_code}\n" $API/finance/dashboard -H "Authorization: Bearer $CASHIER_TOKEN"

# Cross-shop access: switching to a shop with no membership must fail (403/404)
curl -s -o /dev/null -w "%{http_code}\n" -X POST $API/shops/switch \
  -H "$AUTH" -H 'Content-Type: application/json' -d '{"shopId":"00000000-0000-0000-0000-000000000000"}'

# Platform admin endpoints reject shop tokens (expect 403)
curl -s -o /dev/null -w "%{http_code}\n" $API/admin/shops -H "$AUTH"
```

### Admin flow
```bash
ADMIN_LOGIN=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"emailOrPhone":"admin@raghumaya.shop","password":"Admin@123"}')
A_TOKEN=$(echo $ADMIN_LOGIN | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['accessToken'])")
A_AUTH="Authorization: Bearer $A_TOKEN"

curl -s $API/admin/dashboard -H "$A_AUTH" | python3 -m json.tool
curl -s "$API/admin/shops?page=1&limit=5" -H "$A_AUTH" | python3 -m json.tool
curl -s "$API/audit-logs?page=1&limit=5" -H "$A_AUTH" | python3 -m json.tool
```

## 5. Acceptance criteria (release gate)

- [ ] `npm run typecheck` and `npm run build` pass.
- [ ] `openapi.yaml` parses; every §5 endpoint present.
- [ ] Seed verification (§3) passes.
- [ ] Auth→invoice curl flow (§4): GST math matches (CGST/SGST split, IGST path), idempotency returns the same invoice, payment updates status + ledger, stock deducted.
- [ ] RBAC negatives: cashier blocked from finance, cross-shop switch rejected, shop token rejected on `/admin/*`.
- [ ] Audit: a created invoice appears in `GET /audit-logs` with actor/action/entity.
- [ ] Health: `/health/live` 200, `/health/ready` 200 with DB+Redis ok.
