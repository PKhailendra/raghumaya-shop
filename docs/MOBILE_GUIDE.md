# Mobile Guide — Owner App (Expo)

The RaghuMayaShop owner app runs on Android and iOS (Expo SDK 52). It uses the **same API** as the web dashboard — everything you do on mobile appears on the web too.

## 1. Install

**Development / testing (Expo Go):**

1. Install **Expo Go** from the Play Store / App Store.
2. Start the dev server on your machine: `npm run dev:mobile` (from `~/workspace/raghumaya-shop`).
3. Scan the QR code shown in the terminal with Expo Go (Android) or the Camera app (iOS).
4. Make sure your phone and computer are on the same Wi-Fi, or set `EXPO_PUBLIC_API_URL` to your machine's LAN IP, e.g. `http://192.168.1.10:4000/api/v1`.

**Production:** install the RaghuMayaShop app from the Play Store / App Store (EAS build) and open it.

## 2. Login

1. Open the app → **Login**.
2. Enter your phone number/email and password, then tap **Login**.
3. If you registered with OTP only, use **Login with OTP**: enter your phone → receive the SMS code → enter it.
4. If 2FA is enabled on your account, enter your authenticator/SMS code when asked.
5. Your tokens are stored securely on the device (Expo SecureStore). Logging in on a new device registers it; you can review devices under **More → Settings → Devices**.

Forgot password? Tap **Forgot password** on the login screen, enter your phone/email, and follow the reset link/code.

## 3. Dashboard tab

- **KPI cards**: today's sales, this month's sales, low-stock count, pending dues.
- **Sales chart**: daily/weekly/monthly revenue (pinch/zoom supported).
- Pull down to refresh. If the API is unreachable, an **offline banner** appears — your view may be stale until you reconnect.

## 4. Inventory tab — barcode scan

1. Tap **Inventory**. Use the search bar or scan:
   - Tap the **barcode icon** → point the camera at the product barcode/QR → the product opens instantly (`GET /inventory/products/lookup`).
2. Tap **+** to add a product (name, SKU, barcode, prices, GST%, stock, reorder level, photo).
3. Tap a product to edit price/stock, add variants or batches, or view its stock movement history.

Camera permission is requested on first scan; you can change it in system settings.

## 5. Billing tab — new invoice flow

1. Tap **Billing → New Invoice**.
2. Choose the customer (tap `+` to add one on the fly).
3. Add items: tap the **scan icon** and scan each product's barcode, or search by name. Enter quantity per line; price and GST% auto-fill.
4. Apply line discounts if needed. The **totals card** shows subtotal, discount, taxable amount, and CGST/SGST (same state) or IGST (other state) live.
5. Set due date for credit sales.
6. Tap **Issue Invoice**. The invoice number (e.g. `INV-2026-0042`) is generated.
7. **Share**: download/print the **PDF**, or send the **SMS / WhatsApp** link to the customer.
8. Record payment from the invoice screen: **Add Payment** → amount + mode (Cash/UPI/Card/Bank/Cheque).

## 6. Customers tab & reminders

- **Customers** lists everyone; the **Dues** filter shows who owes money.
- Open a customer for profile, purchase history, **ledger** (running balance), and **due payments**.
- Tap **Remind** → **SMS** or **WhatsApp** to send a due reminder with the invoice link. Sent reminders appear under **Reminder history**.

## 7. More tab

- **Stock alerts**: low stock, out of stock, expiring batches.
- **Finance summary**: revenue, expenses, profit, cash in/out, tax payable.
- **Team**: invite staff, change roles, remove members.
- **Settings**: shop profile, **shop switcher** (if you own multiple shops), notification preferences, devices, change password, **Logout**.

## 8. Offline behavior

- The app shows an **offline banner** when the API is unreachable and serves the last cached data (TanStack Query cache).
- **Reads** (dashboards, lists) work from cache; **writes** (invoices, payments, stock changes) are queued and retried — do not close the app mid-queue if possible. Invoices use **idempotency keys**, so a retried invoice is never billed twice.
- Barcode scanning works offline for products already cached, but lookups of new products need connectivity.
- Pull-to-refresh on any screen forces a fresh sync when back online.

## 9. Troubleshooting

| Problem | Fix |
|---|---|
| "Session expired" loop | Log out and log in again (refresh token rotation) |
| Barcode won't scan | Good lighting; hold steady; check camera permission |
| Invoice total looks wrong | Check product GST% and whether customer state = your state (CGST/SGST) or different (IGST) |
| SMS link not received | Check SMS provider status in web dashboard notifications; retry from invoice screen |
| Can't see a menu | Your role lacks the permission — ask the shop owner (Team → your role) |
