# User Guide — Shop Owner

This manual is for shop owners and their staff. It uses simple English and assumes you are using the **web dashboard** (`/shop/*`) or the **mobile app** — the steps are the same in both.

## 1. Getting started

1. **Register**: Open the app/website and tap **Register**. Enter your name, phone number, password, and shop name. If someone gave you a referral code, enter it too.
2. **Login**: Enter your phone/email and password. If your shop uses 2-step verification, enter the code from your authenticator app (or the SMS you receive).
3. **Dashboard**: After login you see today's sales, this month's sales, low-stock alerts, and pending payments. This is your home screen.

> If you run more than one shop, use the **shop switcher** (top bar → shop name) to change shops. Your login stays the same; only the active shop changes.

## 2. Set up your shop

1. Go to **Settings → Shop**.
2. Fill in: shop name, GST number (if you have one), phone, email, full address (city, state, PIN code).
3. Save. This information prints on your invoices.

## 3. Add products

1. Go to **Inventory → Products** and tap **Add Product**.
2. First create **Categories** (e.g. Groceries, Dairy) and **Brands** if you need them.
3. Fill in the product form:
   - **Name** (e.g. "Premium Rice 25kg"), **SKU** (your own code, e.g. `RICE-25KG`)
   - **Barcode**: scan the packet barcode with your phone, or type it
   - **Purchase price** (what you pay the supplier), **Selling price** (what you charge)
   - **GST %** (e.g. 5), **Unit** (kg, piece, bag…)
   - **Reorder level**: the stock quantity at which you want a low-stock alert
4. Add a photo (optional but recommended for the mobile catalog).
5. If the product has sizes (e.g. 10kg / 25kg bags), add them as **variants**. If you track manufacturing batches with expiry dates, add **batches**.
6. Save.

Tip: after adding products once, you can find any product instantly by scanning its barcode in **Billing → New Invoice** or in **Inventory** search.

## 4. Stock in, stock out & transfers

Your stock is tracked per **warehouse** (e.g. "Main Shop", "Godown"). Go to **Stock**.

- **Stock In** (`+`): when new goods arrive from a supplier. Choose warehouse, scan/select products, enter quantity and batch/expiry if any.
- **Stock Out** (`−`): when goods are damaged, returned, or used. Requires enough stock, else it is blocked.
- **Transfer**: move stock between your warehouses (e.g. Godown → Shop). Enter from/to warehouse and quantities.
- **Alerts**: **Stock → Alerts** shows *Low Stock* (at/below reorder level), *Out of Stock*, and *Expiring Soon* batches. Check this every morning.
- **Movements**: every stock change is recorded as a permanent entry — you can see the full history per product.

Note: invoices automatically reduce stock (`SALE` movement), and supplier purchases automatically add stock (`PURCHASE` movement). You normally only do manual stock in/out for corrections.

## 5. Create a GST invoice

1. Go to **Billing → New Invoice**.
2. Select the **customer** (or add a new one with the `+` button).
3. Add items: scan the barcode or search the product name, then enter quantity. The app fills the price and GST% from the product.
4. Apply discount if any (per line, in %).
5. Check the totals:
   - **Subtotal** → minus **Discount** = **Taxable amount**
   - GST is added on the taxable amount. Same-state sales show **CGST + SGST** split; other-state sales show **IGST**.
6. Set **Issue date** and **Due date** (for credit sales).
7. Tap **Save** (draft) or **Issue**. Issuing locks the invoice number (e.g. `INV-2026-0042`).
8. **Share** the invoice: tap **PDF** to download/print, **SMS Link** or **WhatsApp** to send it to the customer.

To record a payment: open the invoice → **Add Payment** → enter amount, mode (Cash/UPI/Card/Bank/Cheque), and reference. The invoice status updates automatically (Paid / Partially Paid) and the customer's due balance reduces.

## 6. Customers & due reminders

1. **Customers → Add Customer**: name, phone, (optional) email, address, and **credit limit** (max due you allow).
2. Open a customer to see: profile, **purchase history**, **ledger** (every invoice and payment with running balance), and **due payments**.
3. **Due Payments** list shows everyone who owes you money and how overdue it is.
4. To remind: open the customer → **Remind** → **SMS** or **WhatsApp**. The message includes the due amount and a link to the invoice. Every reminder is recorded in **Reminder history**.

## 7. Finance tracking

**Finance → Dashboard** shows: total revenue (invoice + manual), expenses, profit, cash in/out, tax payable (CGST/SGST/IGST), asset value, and outstanding loans.

- **Expenses**: record rent, salaries, utilities, etc. with date and vendor.
- **Revenues**: record income that is not from invoices (e.g. services).
- **Assets**: track things you own (fridge, vehicle) with purchase value.
- **Liabilities**: track loans with outstanding amount and due date.
- **Reports**: monthly, yearly, and tax reports for your accountant. Use **Tax Report** before filing GST returns.

## 8. Team members

1. **Team → Invite**: enter name, phone, email, and choose a **role**:
   - **Manager** — can manage products, stock, customers, billing (no finance settings)
   - **Cashier** — can create bills and take payments
   - **Accountant** — can see finance and invoices
   - **Inventory staff** — can manage stock only
   - **Staff** — view-only for products, customers, orders
2. The new member logs in with their phone number and the password you set (or the OTP flow).
3. You can change a member's role or remove them anytime. You cannot remove the last owner.

## 9. Subscription (your plan)

**Settings → Subscription** shows your current plan (Free/Starter/Professional/Enterprise), limits (products, customers, invoices/month), and usage.

- **Upgrade/Downgrade**: choose a plan and billing cycle (monthly/yearly). Downgrades are blocked only if you already exceed the smaller plan's limits.
- **Trial**: new shops start on a trial — the expiry date is shown here.

## 10. Daily routine (recommended)

1. Morning: check **Dashboard** + **Stock Alerts** (low stock, expiring batches).
2. During the day: create invoices by **barcode scan**; record payments immediately.
3. Evening: check **Due Payments** and send reminders; record the day's expenses.
4. Weekly: review **Analytics** (top products, top customers) and **Finance → Profit & Loss**.
