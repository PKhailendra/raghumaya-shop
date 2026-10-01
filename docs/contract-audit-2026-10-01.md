# RaghuMayaShop Web â API Contract Audit â Full Report

**Scope:** 21 pages audited read-only (8 shop-owner + 13 platform-admin). Web calls `fetch(API_BASE + path)` with `API_BASE=â¦/api/v1` (`apps/web/lib/api.ts:4`); backend mounts routers at `/api/v1/{auth,shops,inventory,stock,purchases,billing,customers,finance,analytics,subscriptions,referrals,audit,notifications,admin}` (`apps/api/src/app.ts:48-61`).

**Root pattern (both agents independently confirmed):** the web was written against a flattened/renamed DTO contract, while the backend returns raw Prisma records (nested relations, Prisma field names like `issueDate`, `totalAmount`, `outstandingBalance`, `revenueDate`) and `{ data, meta }` envelopes where the web expects bare arrays. Previously fixed: `authApi.login`, `analyticsApi`, `billingApi.invoices/getInvoice`.

**Already-verified-working pages (not in scope):** login, shop dashboard, inventory, billing list.

---

## PART A â SHOP-OWNER PAGES

### A1. `apps/web/app/(shop)/shop/team/page.tsx`
- **`shopsApi.members`** (api.ts:233) â **CRASH.** `GET /api/v1/shops/:id/members` exists, method OK. But `shops.service.ts:listMembers` returns `{ data, meta }` envelope; web expects bare `ShopMember[]`. Page does `rows.map(...)` on the object â TypeError. Even unwrapped, rows are raw `shopMembership` records with nested `account`: no `name` (backend `account.fullName`), no top-level `email`/`phone` (backend `account.email`/`account.phone`). `role`, `status`, `permissions`, `joinedAt` match.
- **`shopsApi.inviteMember`** (api.ts:234) â **422 on every invite.** Route `POST /shops/:id/members/invite` exists. Web sends `{ name, email?, phone?, role }`; `inviteMemberSchema` (shared/schemas.ts:180) requires **`fullName`** (zod strips unknown `name`) and requires **`phone`** (min 7), which the web treats as optional.
- **`shopsApi.updateMember`** (api.ts:235-236) â OK. **`shopsApi.removeMember`** (api.ts:237) â OK.

### A2. `apps/web/app/(shop)/shop/customers/page.tsx`
- **`customersApi.list`** (api.ts:481) â **WRONG DATA.** `GET /customers` â `{ data, meta }` â, but `Customer` model has **`outstandingBalance`**, not `balance`, and **no `totalPurchases`**. Balance/total-purchases columns render â¹0.00; balance badge always "success".
- **`customersApi.duePayments`** (api.ts:486) â **WRONG DATA + broken links.** `GET /customers/due-payments` exists, but `customers.service.ts:duePayments` returns **invoice rows** (nested `customer: { id, name, phone }`, `dueAmount`), not customers. Page renders `c.name`/`c.phone` â blank, and links to `/shop/customers/${c.id}` using the **invoice id** â detail page 404s.
- **`customersApi.create`** (api.ts:483), **`update`** (api.ts:484) â OK. **`sendSmsReminder`/`sendWhatsappReminder`** (api.ts:490-491) â OK (bodiless POST parses; `reminderSchema` all-optional).

### A3. `apps/web/app/(shop)/shop/customers/[id]/page.tsx`
- **`customersApi.get`** (api.ts:482) â **WRONG DATA.** `balance` â `outstandingBalance`; `totalPurchases` nonexistent â stat cards â¹0.00.
- **`customersApi.ledger`** (api.ts:489) â **CRASH.** Route `GET /customers/:id/ledger` exists, but backend returns **`{ customer, ledger, closingBalance }`** object; web expects `LedgerEntry[]`. Page casts to array â `.map` on object â TypeError. Rows also differ: no `id` (backend `referenceId`), `balance` vs expected `runningBalance`.
- **`customersApi.purchases`** (api.ts:488) â **WRONG DATA.** Envelope â, but rows are raw invoices: `invoiceDate` â backend `issueDate` (shows "-"), `grandTotal` â backend `totalAmount` (â¹0.00). No `mapInvoice` adapter here (unlike billing).

### A4. `apps/web/app/(shop)/shop/purchases/page.tsx`
- **`purchasesApi.list`** (api.ts:358) â **WRONG DATA.** Envelope â; `purchaseNumber`, `totalAmount`, `paidAmount`, `status` â. But `supplierName` doesn't exist (backend nested `supplier: { id, name }`) â always "-"; `invoiceDate` doesn't exist (backend `purchaseDate`) â date column always "-".
- **`purchasesApi.create`** (api.ts:360) â **422 + silent data loss.** `POST /purchases` exists. `purchaseItemSchema` (shared/schemas.ts:354) requires **`unitCost`**; web sends **`unitPrice`** â 422. Additionally `supplierName`/`invoiceDate` are unknown keys â stripped, so the purchase would be created without supplier/date even if items were fixed.

### A5. `apps/web/app/(shop)/shop/stock/page.tsx`
- **`stockApi.warehouses`** (api.ts:317) â OK (controller wraps `{ data }`; page's `toList()` handles both).
- **`stockApi.createWarehouse`** (api.ts:318) â minor silent data loss: `location` stripped (schema uses `address`); warehouse still creates.
- **`stockApi.levels`** (api.ts:326-327) â **WRONG DATA.** Envelope â, but rows are raw `StockLevel` with nested `product`: `productName` â `product.name` (blank), `sku` â `product.sku` (blank), `warehouseName` doesn't exist (always "-"), `reorderLevel` â `product.reorderLevel` (status badge always "OK" unless qty â¤ 0). `quantity` â.
- **`stockApi.movements`** (api.ts:328-329) â minor: no `productName` â falls back to truncated `productId`.
- **`stockApi.lowStockAlerts`** (api.ts:330) â **CRASH.** Controller returns service result unwrapped: **`{ data, meta }`**; web expects `StockLevel[]`. Page calls `.slice(0,5)` on the object â TypeError. Items also shaped differently: `{ productId, name, sku, unit, currentStock, reorderLevel, alert }` vs expected `{ id, productName, quantity }`.
- **`stockApi.outOfStockAlerts`** (api.ts:331) â **CRASH.** Same as above.
- **`stockApi.transfer`** (api.ts:323) â OK.

### A6. `apps/web/app/(shop)/shop/finance/page.tsx`
- **`financeApi.dashboard`** (api.ts:528) â **WRONG DATA.** `totalRevenue`, `totalExpenses` â. No `netProfit` (backend `grossProfit`), no `cashBalance` (backend `cashIn`/`cashOut`/`netCashFlow`) â two stat cards always â¹0.00.
- **`financeApi.cashFlow`** (api.ts:529) â **broken chart.** Backend returns **`{ series, totals }`**; web expects an array (`cashFlowData.length` â undefined â recharts gets an object). Even unwrapped, series items are `{ date, cashIn, cashOut, net }` vs chart's `{ date, inflow, outflow }`.
- **`financeApi.profitLoss`** (api.ts:530) â **WRONG DATA.** Backend nests `revenue: { totalRevenue }`, `expenses: { totalExpenses }`; page reads them flat â â¹0. `gstCollected`/`gstPaid` don't exist (backend `taxPayable`/`cgst`/`sgst`/`igst`) â â¹0. `taxPayable` â (backend `netTaxPayable`) â â¹0. Only `netProfit` matches.
- **`financeApi.taxReport`** (api.ts:534) â **WRONG DATA.** Backend returns `{ range, outputTax: { cgst, sgst, igst, total }, inputTaxCredit, netTaxPayable, taxableRevenue, invoiceCount }` â none of the page's six keys exist â entire tax card â¹0.00.
- **Entries list** (`revenues`/`expenses`/`assets`/`liabilities`, api.ts:512/516/520/524) â **WRONG DATA.** Revenues/expenses: `description` â backend `title` ("-"); `categoryName` â nested `category` ("-"); `date` â `revenueDate`/`expenseDate` ("-"); `amount` â. Assets use `name`, `purchaseValue`/`currentValue`, `purchaseDate` (amount â¹0.00). Liabilities use `name`, `totalAmount`/`outstandingAmount`, `dueDate`.
- **`createRevenue`/`createExpense`** (api.ts:513/517) â **422.** Web sends `{ description, amount, categoryId, date, paymentMode }`; schemas require **`title`** (missing) and strip `description`/`date` (need `revenueDate`/`expenseDate`); revenue schema has no `paymentMode`.
- **`createAsset`** (api.ts:521) â **422.** Schema requires `name`, `purchaseValue`, `currentValue`; web sends single `amount`.
- **`createLiability`** (api.ts:525) â **422.** Schema requires `name`, `totalAmount`, `outstandingAmount`; web sends single `amount`.
- **`updateRevenue/updateExpense/updateAsset/updateLiability`** (api.ts:514/518/522/526) â silent data loss: partial schemas accept updates but strip `description`/`date` â edits to those fields never persist.
- **`deleteRevenue/deleteExpense/deleteAsset/deleteLiability`** (api.ts:515/519/523/527) â OK. **`financeApi.categories`** (api.ts:509-510) â OK.

### A7. `apps/web/app/(shop)/shop/settings/page.tsx`
- **`shopsApi.get`** (api.ts:229), **`shopsApi.update`** (api.ts:231) â OK. **`authApi.changePassword`** (api.ts:178) â OK.
- **`authApi.devices`** (api.ts:187) â **CRASH.** Route exists, but `auth.controller.ts:listDevices` returns **`{ data }`**; web expects `Device[]`. Page does `(devices.data ?? []).map` on the object â TypeError on any successful load. Unwrapped rows also differ: `name` (not `deviceName`), `type` (not `deviceType`), `lastSeenAt` (not `lastUsedAt`).
- **`authApi.deleteDevice`** (api.ts:188) â OK.

### A8. `apps/web/app/(shop)/shop/subscription/page.tsx`
- **`subscriptionsApi.plans`** (api.ts:624) â **WRONG DATA.** Array â, `code`/`name`/`features`/`limits` â. But `price` doesn't exist (backend `monthlyPrice`/`yearlyPrice`) â â¹0.00 for every plan; `billingCycle` doesn't exist â renders "/undefined".
- **`subscriptionsApi.current`** (api.ts:625) â **WRONG DATA.** `planId`/`status`/`startDate`/`trialEndsAt`/`endDate` â. But `planName` doesn't exist (backend nested `plan.name`, plus `planCode`) â "Current plan" title blank.
- **`subscriptionsApi.limits`** (api.ts:627) â **WRONG DATA.** Backend returns `{ planCode, status, usage }`; page iterates `limits.data` directly instead of `limits.data.usage` â Usage section renders garbage cards ("Plan Code 0/â", "Status 0/â", "Usage 0/â") instead of per-limit usage bars.
- **`subscriptionsApi.change`** (api.ts:628) â **422.** Web sends `{ planId }` (uuid); `subscriptionChangeSchema` requires **`planCode`** â `['FREE','STARTER','PROFESSIONAL','ENTERPRISE']`.
- **`subscriptionsApi.cancel`** (api.ts:629) â OK.

---

## PART B â PLATFORM-ADMIN PAGES

### B1. `apps/web/app/(admin)/approvals/page.tsx`
- **`adminApi.approvals`** (api.ts:733) â `GET /admin/approvals` path â / method â (`admin.routes.ts:48`), but **render-breaking shape mismatch.** Backend returns `UserProfileChange` rows (`admin.service.ts:187-204`) with `entityType`, `changes`, `shopId`, `requesterName/requesterEmail` â **no `type`, no `requestedValue`, no `shopName`**. Page renders `a.type` â blank badge; `a.requestedValue` â undefined â `summarizeChange(undefined)` calls `Object.entries(undefined)` â **TypeError, row render crashes**; `a.shopName` falls back to raw `shopId` (works by accident). Secondary: status dropdown offers `MODIFICATION_REQUESTED`; backend query schema (`admin.routes.ts:19`) allows only `PENDING|APPROVED|REJECTED` â selecting it 400s.
- **`adminApi.approveApproval`** (api.ts:734) â path â / method â. Works, but `{ comment }` body silently dropped (backend ignores it). Super-admin-only (`admin.routes.ts:49`) â 403 for plain `ADMIN`.
- **`adminApi.rejectApproval`** (api.ts:735) â path â / method â, but **body key mismatch:** web sends `{ comment }`, backend expects `{ reason }` (`admin.routes.ts:50`); non-strict schema â no 400, but `reviewNote` saved as null â reviewer's comment lost. Super-admin-only â 403 for plain admins.
- **`adminApi.requestModification`** (api.ts:736) â **404.** `POST /admin/approvals/:id/request-modification` does not exist. Backend has only `/approvals/:id/approve` and `/approvals/:id/reject`. The "Modify" button can never succeed.

### B2. `apps/web/app/(admin)/audit-logs/page.tsx`
- **`adminApi.auditLogs`** (api.ts:745) â **404.** `GET /admin/audit-logs` has no backend route. Audit router mounts at `/api/v1/audit` (`app.ts:60`) exposing only `GET /` and `GET /dashboard` (`audit.routes.ts:14-15`) â and both require shop context, which platform admins fail (`requireShopContext` â 400 `SHOP_CONTEXT_REQUIRED`). Page can never load. (Same for the unused `auditApi.list` at api.ts:647 â `GET /audit-logs`.) Field note if it ever resolved: `AuditLog` has no `actorName` (only `actorId`/`actorType`).

### B3. `apps/web/app/(admin)/dashboard/page.tsx`
- **`adminApi.dashboard`** (api.ts:718) â path â / method â, but **total response-shape mismatch â page white-screens.** Backend `platformDashboard()` returns **flat** `{ shops: number, users: number, activeSubscriptions, openTickets, pendingApprovals, invoiceVolume, invoiceCount, recentShops }` (`admin.service.ts:17-32`). Web expects nested `AdminDashboardSummary` (`s.shops.total/active/â¦`, `s.revenue.daily/weekly/monthly/yearly`, `s.users.total/active/suspended`, `s.subscriptions.free/starter/â¦`, `s.finance.totalPlatformRevenue/â¦`). `s.subscriptions.free` on undefined â TypeError. None of the 8 stat cards can render.
- **`adminApi.financeSummary`** (api.ts:732) â **404.** `GET /admin/finance/summary` doesn't exist. Closest: `GET /admin/reports/revenue` â `{ range, mrr, newSubscriptions, byPlan }` (different path *and* shape). Revenue-growth query errors; page then evaluates `(revenueGrowth.data as unknown[]).length` on undefined â **TypeError crash**.

### B4. `apps/web/app/(admin)/finance/page.tsx`
- **`adminApi.financeSummary`** (api.ts:732) â **404** (same as B3). Entire page stuck on error state; none of `totalRevenue/monthlyRevenue/annualRevenue/pendingPayments/revenueGrowth/failedPayments/subscriptionRenewals` exists in the backend.

### B5. `apps/web/app/(admin)/notifications/page.tsx`
- **`notificationsApi.list`** (api.ts:665) â path â / method â, but backend applies `requireShopContext` (`notifications.routes.ts:14`) â **400 `SHOP_CONTEXT_REQUIRED` for platform admins**; page can never load for its intended audience. Field mismatches on top: backend rows have `type` (web expects `category` â blank badge), **no `status`** (web branches on `SENT`/`FAILED` â badge always "-", Retry button never appears), `channel` nested in `data.channel` (web expects top-level â missing badge).
- **`notificationsApi.markRead`** (api.ts:666) â **method mismatch â 404.** Web `PATCH /notifications/:id/read` vs backend **`POST /notifications/:id/read`** (`notifications.routes.ts:19`).
- **`notificationsApi.retry`** (api.ts:667) â path â / method â (subject to the same shop-context 400 for admins).

### B6. `apps/web/app/(admin)/reports/page.tsx`
- **`adminApi.exportReport`** (api.ts:742) â **404.** `POST /admin/reports/exports` doesn't exist. Backend has only `GET /admin/reports/revenue` (different method/path/shape).
- **`adminApi.exportJob`** (api.ts:744) â **404.** `GET /admin/reports/exports/:jobId` doesn't exist. All 5 report cards ("Shops", "Revenue", "Users", "Subscriptions", "Audit") are dead.

### B7. `apps/web/app/(admin)/security/page.tsx`
- **`adminApi.loginHistory`** (api.ts:749) â **wrong path â 404.** Web `GET /admin/security/login-history` vs backend **`GET /admin/login-history`** (`admin.routes.ts:61`). If fixed, field mismatches: backend rows are audit-log rows + `actor` object; web reads `row.email` (missing â "-"), `row.accountId` (missing), `row.success` (missing â `!== false` is true â **every row shows "Success", including `LOGIN_FAILED` rows**). `ipAddress`, `userAgent` â.
- **`adminApi.securityDevices`** (api.ts:750) â **wrong path â 404.** Web `GET /admin/security/devices` vs backend **`GET /admin/devices`** (`admin.routes.ts:62`). If fixed: backend `Device` rows have `name` (web `d.deviceName` â blank), `type` (web `d.deviceType` â blank), `lastSeenAt` (web `d.lastUsedAt` â "-"). `ipAddress`, `createdAt` â.

### B8. `apps/web/app/(admin)/settings/page.tsx`
- **`adminApi.settings`** (api.ts:747) â path â / method â / shape compatible. **OK.**
- **`adminApi.updateSettings`** (api.ts:748) â **method mismatch â 404.** Web `PATCH /admin/settings` vs backend **`PUT /admin/settings`** (`admin.routes.ts:59`, super-admin-only). Saving always fails.

### B9. `apps/web/app/(admin)/shops/page.tsx`
- **`adminApi.shops`** (api.ts:719) â path â / method â / fields â. Caveat: backend query schema allows status only `ACTIVE|SUSPENDED` (`admin.routes.ts:15`); page's `BLOCKED`/`INACTIVE` filter options â 400 if selected.
- **`adminApi.suspendShop`** (api.ts:723) â path â / method â. Super-admin-only â 403 for plain admins.
- **`adminApi.createShop`** (api.ts:721) â **404.** No admin shop-creation endpoint (shops are created via `/auth/register-shop-owner`). "Add shop" dialog can never succeed.
- **`adminApi.blockShop`** (api.ts:724) â **404.** No block concept for shops (only suspend/reactivate).
- **`adminApi.activateShop`** (api.ts:725) â **404.** Backend equivalent is `POST /admin/shops/:id/reactivate` (super-admin-only).
- **`adminApi.deleteShop`** (api.ts:726) â **404.** Backend cannot delete shops at all.

### B10. `apps/web/app/(admin)/shops/[id]/page.tsx`
- **`adminApi.getShop`** (api.ts:720) â path â / method â. Info tab mostly OK, but: **Members tab always empty** (web reads `shop.members`; backend includes **`memberships`** â `shop.members` undefined â "No members"; member rows also expect `member.name`, backend has `fullName`); **Subscription tab always empty** (web reads `shop.subscription`; backend includes **`subscriptions`** array â always "No subscription"; items lack `planName`, nested `plan` object instead); **Activity tab always empty** (web reads `shop.recentActivity`; backend never returns it). Info-tab notes: `shopType`, `ownerName` don't exist â "-"; `address` is a DB string but web does `Object.values(shop.address)` â garbled `"a,b,c"`.

### B11. `apps/web/app/(admin)/subscriptions/page.tsx`
- **`adminApi.subscriptions`** (api.ts:730) â path â / method â. `shopName`, `startDate`, `status` â â but **`s.planName` doesn't exist** (backend row has `planId` + nested `plan`; `listSubscriptionsAdmin` only adds `shopName`) â Plan column blank.
- **`subscriptionsApi.plans`** (api.ts:624) â path â / method â. **Field mismatches:** backend returns `{ monthlyPrice, yearlyPrice, â¦ }` â **no `price`** (web `inr(plan.price)` â "â¹0.00" for every plan), **no `billingCycle`** ("/undefined"). `features`, `limits`, `name` â.
- **`adminApi.assignSubscription`** (api.ts:731) â path â / method â, but **body mismatch â always 400:** web sends `{ shopId, planId }`; backend body schema requires **`planCode`** (enum `FREE|STARTER|PROFESSIONAL|ENTERPRISE`) â `planId` not accepted, `planCode` missing â zod validation error on every assign.

### B12. `apps/web/app/(admin)/support/page.tsx`
- **`adminApi.tickets`** (api.ts:737) â **wrong path â 404.** Web `GET /admin/support/tickets` vs backend **`GET /admin/tickets`** (`admin.routes.ts:32` via `r.use('/tickets',â¦)`). If fixed: `t.ticketNo` doesn't exist â blank column; `t.shopName` missing (backend hydrates nested `shop: {id,name}`) â "-"; `subject/priority/status/updatedAt/createdAt/description` â. Secondary: status options `ASSIGNED`/`WAITING_ON_CUSTOMER` vs backend enum `OPEN|IN_PROGRESS|RESOLVED|CLOSED` â 400.
- **`adminApi.createTicket`** (api.ts:738) â **404** (`POST /admin/support/tickets` vs backend `POST /admin/tickets`). Priority dropdown offers `CRITICAL`; backend enum `LOW|MEDIUM|HIGH|URGENT` â 400 if selected.
- **`adminApi.resolveTicket`** (api.ts:740) â **404.** Backend equivalent: `PATCH /admin/tickets/:id` with `{ status: "RESOLVED" }`.
- **`adminApi.closeTicket`** (api.ts:741) â **404.** Backend equivalent: `PATCH /admin/tickets/:id` with `{ status: "CLOSED" }`.
- (`adminApi.assignTicket` (api.ts:739) â `POST /admin/support/tickets/:id/assign` â also 404, but not called by this page.)

### B13. `apps/web/app/(admin)/users/page.tsx`
- **`adminApi.users`** (api.ts:727) â path â / method â. **Field mismatches:** backend `ACCOUNT_SELECT` has **`fullName`** (web renders `u.name` â blank Name column), **no `role`** (web renders `u.role` â blank Role column). `email`, `status`, `lastLoginAt` â.
- **`adminApi.resetUserPassword`** (api.ts:729) â **404.** No password-reset endpoint; closest are `POST /admin/users/:id/suspend|reactivate` (super-admin-only).

---

## Cross-cutting issues
- **Super-admin gates:** approve/reject approvals, suspend/reactivate shop, suspend/reactivate user, `PUT /admin/settings`, `POST /admin/devices/:id/revoke` all require `requireSuperAdmin` (`admin.routes.ts`). A plain `ADMIN` (not `SUPER_ADMIN`) gets 403 on contract-correct calls.
- **Platform admins can't use shop-scoped routers:** `/notifications/*` and `/audit/*` enforce `requireShopContext` â 400 for any admin actor. These pages need admin-scoped equivalents, not just path fixes.
- **Envelope-vs-array crashes (4 pages):** team members, stock low-stock/out-of-stock alerts, customer ledger tab, settings devices list â all consume `{ data, meta }` / `{ data }` objects as arrays â TypeError on load.
- **Net tally:** 8 of 13 admin pages hit at least one hard 404; admin dashboard white-screens on shape mismatch; on the shop side, 4 pages crash on load, 5 distinct create/submit actions 422, and most remaining list/detail pages render blank/â¹0.00 fields."},"created_at":"2026-10-01T13:55:54.275262330+00:00"}

---

## Session 3 — 2026-10-01 (evening): live E2E verification fixes

### F1. Admin login dropped `role` — platform admins bounced to /shop/dashboard
- **Root cause:** `auth.service.ts` `findLoginIdentity` didn't select `role` for admins; `actorSummaryOf` and `issueTokenPair` set `role: undefined` for admin actors.
- Web `isPlatformAdmin()` requires `role === SUPER_ADMIN|ADMIN` → false → admin layout redirected to `/shop/dashboard`.
- **Fix:** select `role` in admin identity query; pass admin role through `actorSummaryOf` in `login()` and `otpVerify()`; set role in `issueTokenPair` actor. Verified: login now returns `"role": "SUPER_ADMIN"`, admin lands on `/dashboard`, all 12 admin routes render with live data.

### F2. Invoice creation did not deduct stock
- **Root cause:** `billing.service.ts` `createInvoice` had zero stock handling; deduction was a separate manual `POST /stock/sales-deduction` call the web never made.
- **Fix:** auto stock deduction inside `createInvoice` transaction via `applyStockMovements` with `type: 'SALE'`, `referenceType: 'INVOICE'` against the default warehouse; idempotent (skips if a SALE movement already exists for the invoice); DRAFT invoices don't deduct.
- `updateInvoice`: DRAFT → issued transition deducts; → CANCELLED restores stock via `INVOICE_REVERSAL` movement (idempotent).
- **Verified live:** sale of 2 units 37→35; cancel 39→40 (restore); purchase receive +5 (35→40).

### E2E transaction verification (2026-10-01, demo shop)
- Invoice INV-2026-0017 created (₹200) → stock -2 ✓
- Payment ₹50 recorded → invoice PARTIALLY_PAID, paidAmount 50 ✓
- Share link + token generated ✓
- Customer ledger entries + outstanding balance updated ✓
- Purchase created (RECEIVED) → stock +5 ✓
- Invoice cancel → stock restored ✓

### Browser click-through (headless Chromium via local proxy, 2026-10-01)
- Super Admin: login → /dashboard (platform stats, revenue charts), /finance, /shops (list + Suspend/Delete + Add shop), /users, /audit-logs (62 events, actor names resolved), /notifications, /approvals, /support, /reports, /security, /subscriptions, /settings — all render.
- Shop Owner: /shop/dashboard (real sales data + charts), /shop/team (member list + permission editor), /shop/customers, /shop/stock, /shop/purchases, /shop/finance — all render.
- Manager (9000000098) & Cashier (9000000097): dashboard + billing render; forbidden actions 403 (verified earlier at API level).

### Test fixtures cleaned
- Sharma General Store fixture shop deleted via `DELETE /api/v1/admin/shops/:id` (endpoint verified 200).
- Demo shop "Raghu Maya General Store" seed data intact; E2E test invoices (INV-2026-0016/0017) remain as consistent demo transactions.

### Known limitation — public demo URL
- Cloudflare Quick Tunnel, localtunnel, and Serveo all fail from this sandbox (TLS interception / silent hang). No public URL could be established from here. To show in a real browser: run the archive locally (`docker compose up` or manual Postgres + `npm run dev`) or deploy API+web to a host (Railway/Render/Fly) and rebuild web with `NEXT_PUBLIC_API_URL=<public-api>/api/v1`.
- Demo-only local settings (NOT in source, only in running build): web built with `NEXT_PUBLIC_API_URL=http://app.local:4000/api/v1`, API `.env` CORS includes `http://app.local:3000`. Source defaults are clean (`http://localhost:3000`).
