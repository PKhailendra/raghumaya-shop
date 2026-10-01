/**
 * Shared domain types for RaghuMayaShop.
 * Mirrors the Prisma enums in apps/api/prisma/schema.prisma.
 * Money is always serialized as a string in JSON.
 */

export const ACCOUNT_STATUSES = ['ACTIVE', 'PENDING', 'SUSPENDED', 'BLOCKED'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'FINANCE', 'AUDITOR'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const MEMBERSHIP_STATUSES = ['ACTIVE', 'PENDING', 'SUSPENDED', 'BLOCKED'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const USER_ROLES = [
  'OWNER',
  'MANAGER',
  'CASHIER',
  'ACCOUNTANT',
  'INVENTORY_STAFF',
  'STAFF',
] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Platform roles (admins table) — maps onto the same permission surface as shop roles. */
export const PLATFORM_ROLES = ['SUPER_ADMIN', 'ADMIN'] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const SHOP_PERMISSIONS = [
  'SHOP_VIEW',
  'SHOP_UPDATE',
  'EMPLOYEE_VIEW',
  'EMPLOYEE_CREATE',
  'EMPLOYEE_UPDATE',
  'EMPLOYEE_DELETE',
  'INVENTORY_VIEW',
  'INVENTORY_CREATE',
  'INVENTORY_UPDATE',
  'INVENTORY_DELETE',
  'STOCK_VIEW',
  'STOCK_ADJUST',
  'CUSTOMER_VIEW',
  'CUSTOMER_CREATE',
  'CUSTOMER_UPDATE',
  'CUSTOMER_DELETE',
  'ORDER_VIEW',
  'ORDER_CREATE',
  'ORDER_UPDATE',
  'ORDER_CANCEL',
  'INVOICE_VIEW',
  'INVOICE_CREATE',
  'INVOICE_UPDATE',
  'PAYMENT_VIEW',
  'PAYMENT_CREATE',
  'FINANCE_VIEW',
  'FINANCE_CREATE',
  'FINANCE_UPDATE',
  'FINANCE_DELETE',
  'ANALYTICS_VIEW',
  'SETTINGS_VIEW',
  'SETTINGS_UPDATE',
  'SUBSCRIPTION_VIEW',
  'SUBSCRIPTION_MANAGE',
  'REFERRAL_VIEW',
  'REFERRAL_MANAGE',
  'NOTIFICATION_VIEW',
  'NOTIFICATION_UPDATE',
  'AUDIT_VIEW',
  'ATTENDANCE_VIEW',
  'ATTENDANCE_MARK',
  'SALARY_VIEW',
  'SALARY_MANAGE',
] as const;
export type ShopPermission = (typeof SHOP_PERMISSIONS)[number];

/**
 * Default permission sets per staff role.
 * Used when a member is created/role-changed WITHOUT explicit permissions,
 * and as a fallback for legacy memberships that stored an empty list.
 * OWNER always gets every permission (see ALL_PERMISSIONS in API auth middleware).
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<Exclude<UserRole, 'OWNER'>, ShopPermission[]> = {
  MANAGER: [
    'SHOP_VIEW',
    'EMPLOYEE_VIEW', 'EMPLOYEE_CREATE', 'EMPLOYEE_UPDATE', 'EMPLOYEE_DELETE',
    'INVENTORY_VIEW', 'INVENTORY_CREATE', 'INVENTORY_UPDATE', 'INVENTORY_DELETE',
    'STOCK_VIEW', 'STOCK_ADJUST',
    'CUSTOMER_VIEW', 'CUSTOMER_CREATE', 'CUSTOMER_UPDATE', 'CUSTOMER_DELETE',
    'ORDER_VIEW', 'ORDER_CREATE', 'ORDER_UPDATE', 'ORDER_CANCEL',
    'INVOICE_VIEW', 'INVOICE_CREATE', 'INVOICE_UPDATE',
    'PAYMENT_VIEW', 'PAYMENT_CREATE',
    'FINANCE_VIEW', 'FINANCE_CREATE', 'FINANCE_UPDATE',
    'ANALYTICS_VIEW',
    'SETTINGS_VIEW',
    'SUBSCRIPTION_VIEW',
    'REFERRAL_VIEW', 'REFERRAL_MANAGE',
    'NOTIFICATION_VIEW', 'NOTIFICATION_UPDATE',
    'AUDIT_VIEW',
    'ATTENDANCE_VIEW', 'ATTENDANCE_MARK',
    'SALARY_VIEW',
  ],
  CASHIER: [
    'SHOP_VIEW',
    'INVENTORY_VIEW',
    'STOCK_VIEW',
    'CUSTOMER_VIEW', 'CUSTOMER_CREATE', 'CUSTOMER_UPDATE',
    'ORDER_VIEW', 'ORDER_CREATE', 'ORDER_UPDATE',
    'INVOICE_VIEW', 'INVOICE_CREATE', 'INVOICE_UPDATE',
    'PAYMENT_VIEW', 'PAYMENT_CREATE',
    'NOTIFICATION_VIEW',
    'ATTENDANCE_VIEW',
  ],
  ACCOUNTANT: [
    'SHOP_VIEW',
    'CUSTOMER_VIEW',
    'INVOICE_VIEW', 'PAYMENT_VIEW', 'PAYMENT_CREATE',
    'FINANCE_VIEW', 'FINANCE_CREATE', 'FINANCE_UPDATE',
    'ANALYTICS_VIEW',
    'NOTIFICATION_VIEW',
    'ATTENDANCE_VIEW',
    'SALARY_VIEW', 'SALARY_MANAGE',
  ],
  INVENTORY_STAFF: [
    'SHOP_VIEW',
    'INVENTORY_VIEW', 'INVENTORY_CREATE', 'INVENTORY_UPDATE',
    'STOCK_VIEW', 'STOCK_ADJUST',
    'NOTIFICATION_VIEW',
    'ATTENDANCE_VIEW',
  ],
  STAFF: [
    'SHOP_VIEW',
    'INVENTORY_VIEW',
    'STOCK_VIEW',
    'CUSTOMER_VIEW',
    'ORDER_VIEW',
    'INVOICE_VIEW',
    'NOTIFICATION_VIEW',
    'ATTENDANCE_VIEW',
  ],
};

export const INVOICE_STATUSES = [
  'DRAFT',
  'ISSUED',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE',
  'CANCELLED',
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const PAYMENT_MODES = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE'] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const PAYMENT_DIRECTIONS = ['IN', 'OUT'] as const;
export type PaymentDirection = (typeof PAYMENT_DIRECTIONS)[number];

export const STOCK_MOVEMENT_TYPES = [
  'IN',
  'OUT',
  'TRANSFER',
  'ADJUSTMENT',
  'PURCHASE',
  'SALE',
] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export const SUBSCRIPTION_STATUSES = ['TRIAL', 'ACTIVE', 'CANCELLED', 'EXPIRED'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const PLAN_CODES = ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

export const BILLING_CYCLES = ['MONTHLY', 'YEARLY'] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

export const SHOP_STATUSES = ['ACTIVE', 'SUSPENDED', 'BLOCKED'] as const;
export type ShopStatus = (typeof SHOP_STATUSES)[number];

export const TWO_FA_METHODS = ['AUTHENTICATOR', 'SMS', 'EMAIL', 'BACKUP_CODE'] as const;
export type TwoFaMethod = (typeof TWO_FA_METHODS)[number];

/** Actor attached to the request by the authenticate middleware. */
export interface Actor {
  actorType: 'account' | 'admin';
  accountId?: string;
  adminId?: string;
  adminRole?: AdminRole;
  /** Active shop taken from the access token claim (shop users only). */
  activeShopId?: string | null;
  /** Shop membership role for the active shop (shop users only). */
  role?: UserRole | null;
  /** Effective permission keys for the active shop. */
  permissions?: ShopPermission[];
}

/** Standard paginated list envelope. */
export interface PageMeta {
  page: number;
  limit: number;
  total: number;
}

export interface ListResponse<T> {
  data: T[];
  meta: PageMeta;
}

/** Standard error envelope. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** Auth token pair returned by login/refresh/otp flows. */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

/** Returned by login when the actor has 2FA enabled. */
export interface TwoFactorChallenge {
  twoFactorRequired: true;
  challengeToken: string;
  methods: TwoFaMethod[];
  expiresAt: string;
}

export type LoginResult =
  | (TokenPair & { twoFactorRequired?: false; actor: ActorSummary })
  | (TwoFactorChallenge & { actor: ActorSummary });

export interface ActorSummary {
  actorType: 'account' | 'admin';
  id: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  role?: string;
  activeShopId?: string | null;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

export interface DateRangeQuery extends PaginationQuery {
  fromDate?: string;
  toDate?: string;
}

/** Invoice line totals computed by the GST helper. */
export interface InvoiceLineTotals {
  lineGross: string;
  discountAmount: string;
  taxableAmount: string;
  gstAmount: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  lineTotal: string;
}

export interface InvoiceTotals {
  subtotal: string;
  discountTotal: string;
  taxableTotal: string;
  cgstTotal: string;
  sgstTotal: string;
  igstTotal: string;
  taxTotal: string;
  totalAmount: string;
}

/** Customer ledger row: invoice = debit, payment = credit. */
export interface LedgerRow {
  date: string;
  type: 'INVOICE' | 'PAYMENT';
  reference: string;
  referenceId: string;
  debit: string;
  credit: string;
  balance: string;
}
