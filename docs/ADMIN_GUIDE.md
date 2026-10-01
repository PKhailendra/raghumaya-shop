# Admin Guide — Platform Administration

This manual is for platform admins (Super Admin, Admin, Support Executive, Finance Manager, Read-Only Auditor). It covers the **Admin Dashboard** (`/dashboard`, `/shops`, `/users`, …).

## 1. Login + 2FA

1. Open the admin dashboard and go to **Login**.
2. Enter your admin email and password.
3. **Device check**: if you are on a new device, complete device verification (a code is sent to your email/SMS).
4. **2FA**: enter the 6-digit code from your authenticator app (or SMS/email, per your settings).
5. You land on the **Dashboard**. All logins, failures, and device decisions are audit-logged and visible under **Security → Login History**.

> Keep your authenticator backup codes somewhere safe. If you lose 2FA access, a Super Admin must reset it.

## 2. Dashboard

The home page shows platform KPIs:

- **Shops**: total, active, inactive, blocked, new today, new this month
- **Revenue**: daily / weekly / monthly / yearly platform revenue
- **Users**: total, active, suspended
- **Subscriptions**: distribution across Free / Starter / Professional / Enterprise
- **Finance**: total platform revenue, pending payments, upcoming renewals

Charts: revenue growth, user growth, shop growth, subscription distribution. Widgets refresh automatically (cached 30–120 s).

## 3. Managing shops

**Shops** lists every tenant. Use search/filters (status, plan, city) and click a shop for detail: info, owner, subscription, revenue summary, inventory summary, employees, recent activity, login history.

### Create a shop (wizard)

**Shops → Create Shop**, then follow the steps:

1. **Basic info**: shop name, shop type, GST number, mobile, email
2. **Owner info**: owner name, mobile, email
3. **Address**: country, state, city, PIN code
4. **Plan**: choose Free / Starter / Professional / Enterprise
5. **Review** and **Create**

The system creates the shop record, the owner account with a **temporary password**, and the subscription — then sends credentials by SMS and email. The temporary password is shown **once** on the confirmation screen.

### Shop lifecycle actions

Select a shop → actions:

- **Suspend**: shop is temporarily disabled (users see a notice; data is kept).
- **Block**: stronger than suspend (e.g. policy violation).
- **Activate**: restores a suspended/blocked shop.
- **Delete**: Super Admin only; soft delete — the shop disappears but data and audit history are preserved.

Every action requires confirmation and is audit-logged.

## 4. Managing users

**Users** lists platform admins and shop accounts.

- View a user: profile, shops, login history, device history, audit logs.
- **Block / Suspend** a user who violates policy.
- **Reset password**: generates a temporary password and sends it by SMS/email.
- Search by name, email, or phone; filter by status and role.

## 5. Approvals queue

**Approvals** shows pending requests:

| Type | Example |
|---|---|
| Profile change | shop owner requested a name/phone change |
| Subscription change | plan upgrade needing review |
| Shop activation | new shop awaiting activation |
| Delete request | shop asked to delete data |

For each request you can **Approve** (applies the change), **Reject** (with a reason — the requester is notified), or **Request modification**. The request shows old vs requested values, the requester, timestamps, IP, and device metadata.

## 6. Subscriptions

**Subscriptions** shows active/expired subscriptions, upcoming renewals, and failed renewal payments.

- **Plans**: create/edit/delete plans (name, monthly/yearly price, trial days, limits, features).
- **Assign**: attach a plan to any shop (`subscriptions.assign` permission).
- **Upgrade / Downgrade** a shop's plan; downgrades are validated against usage limits.
- Revenue-by-plan dashboard for the finance team.

## 7. Support tickets

**Support** is the ticket queue. Ticket lifecycle: `OPEN → ASSIGNED → WAITING_ON_CUSTOMER → RESOLVED → CLOSED`. Priorities: Low / Medium / High / Critical.

- Create a ticket on behalf of a shop; assign it to a support executive.
- The ticket thread keeps all messages and attachments.
- **Resolve** with a resolution note; **Close** when confirmed. The shop is notified at each step.

## 8. Notifications

**Notifications** shows the notification center: system, subscription, payment, security, and support notifications.

- Create and send notifications (in-app, SMS, email, push) to selected shops/users.
- **Retry** failed deliveries (`notifications/:id/retry`).
- SMS usage monitoring shows per-shop send counts for billing awareness.

## 9. Reports

**Reports** offers: shops, revenue, users, subscription, and audit reports.

- Small reports download directly (PDF / Excel / CSV).
- Large reports run **asynchronously**: click Export → the job queues → you get a download link when ready (check **Reports → Export jobs**). Large exports never block the dashboard.

## 10. Audit logs

**Audit Logs** is the immutable action history: who did what, when, on which entity, from which IP/device, with old and new values.

- Filters: user, shop, date range, action, entity type, severity, IP.
- Read-Only Auditors can search and export but cannot change anything.
- High-severity events (failed logins, blocks, deletions) are highlighted; the dashboard widget surfaces recent high-risk events.

## 11. Settings

**Settings** (Super Admin only):

- Platform settings: SMS provider, email provider, rate limits, maintenance mode, default trial days.
- View current values; changes are audit-logged and take effect immediately.

## 12. Security

**Security** covers:

- **Login history**: every admin login attempt with IP, device, user agent, and result.
- **Devices**: trusted devices per admin; revoke unknown devices; `devices.manage` permission required.
- **2FA policy**: enforce authenticator 2FA for all admins (recommended); per-admin method management.

### Admin roles at a glance

| Role | Typical use |
|---|---|
| Super Admin | full control, settings, destructive actions |
| Admin | daily operations: shops, users, approvals, tickets |
| Support Executive | tickets + read access to shops/users |
| Finance Manager | subscriptions, payments, finance reports |
| Read Only Auditor | read + export reports, audit logs, login history |

## 13. Escalation playbook

1. **Shop reports data loss** → check Audit Logs for the shop; restore from backup if needed; never edit financial rows directly — use reversal entries.
2. **Suspicious login** → check Security → Login History; revoke the device; force password reset; enable 2FA.
3. **Payment/renewal failed** → check Subscriptions → failed renewals; retry via Notifications; contact the shop before suspending.
4. **API outage** → check `/health/ready`; look at queue depth (SMS/PDF/export backlogs recover automatically when workers resume).
