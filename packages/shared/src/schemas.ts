/**
 * Shared Zod validation schemas for RaghuMayaShop API payloads.
 * Money fields accept string or number and normalize to a numeric string;
 * the API converts them to Prisma Decimal before persistence.
 */
import { z } from 'zod';
import {
  ADMIN_ROLES,
  BILLING_CYCLES,
  INVOICE_STATUSES,
  MEMBERSHIP_STATUSES,
  PAYMENT_DIRECTIONS,
  PAYMENT_MODES,
  PLAN_CODES,
  SHOP_PERMISSIONS,
  SHOP_STATUSES,
  SHOP_TYPES,
  STOCK_MOVEMENT_TYPES,
  TWO_FA_METHODS,
  USER_ROLES,
} from './types';

export const uuidSchema = z.string().uuid();
export const moneySchema = z
  .union([z.string().trim().min(1), z.number()])
  .refine((v) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0;
  }, { message: 'Invalid amount' })
  .transform((v) => String(v));
export const quantitySchema = moneySchema;
export const rateSchema = z
  .union([z.string().trim().min(1), z.number()])
  .refine((v) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= 100;
  }, { message: 'Rate must be between 0 and 100' })
  .transform((v) => String(v));

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const dateRangeSchema = paginationSchema.extend({
  fromDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  toDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
});

export const analyticsQuerySchema = dateRangeSchema;

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

export const registerShopOwnerSchema = z.object({
  shopName: z.string().trim().min(2).max(150),
  fullName: z.string().trim().min(2).max(150),
  email: z.string().trim().email().max(180).optional(),
  phone: z.string().trim().min(7).max(30),
  password: z.string().min(8).max(100),
  referralCode: z.string().trim().min(3).max(32).optional(),
  shopPhone: z.string().trim().max(30).optional(),
  shopAddress: z.string().trim().max(500).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  pincode: z.string().trim().max(20).optional(),
  gstNumber: z.string().trim().max(20).optional(),
  shopType: z.enum(SHOP_TYPES).optional(),
});

export const createShopUserSchema = z.object({
  fullName: z.string().trim().min(2).max(150),
  email: z.string().trim().email().max(180).optional(),
  phone: z.string().trim().min(7).max(30),
  password: z.string().min(8).max(100).optional(),
  role: z.enum(USER_ROLES).default('STAFF'),
  permissions: z.array(z.enum(SHOP_PERMISSIONS)).optional(),
});

export const loginSchema = z.object({
  emailOrPhone: z.string().trim().min(3).max(180),
  password: z.string().min(1).max(100),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(10).optional(),
  allDevices: z.boolean().default(false),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(100),
});

export const forgotPasswordSchema = z.object({
  emailOrPhone: z.string().trim().min(3).max(180),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  newPassword: z.string().min(8).max(100),
});

export const otpRequestSchema = z.object({
  emailOrPhone: z.string().trim().min(3).max(180),
  purpose: z.enum(['LOGIN']).default('LOGIN'),
});

export const otpVerifySchema = z.object({
  emailOrPhone: z.string().trim().min(3).max(180),
  code: z.string().trim().min(4).max(10),
  purpose: z.enum(['LOGIN']).default('LOGIN'),
});

export const createAdminSchema = z.object({
  fullName: z.string().trim().min(2).max(150),
  email: z.string().trim().email().max(180),
  phone: z.string().trim().max(30).optional(),
  password: z.string().min(8).max(100),
  role: z.enum(ADMIN_ROLES).default('ADMIN'),
  permissions: z.array(z.string().trim().min(1)).optional(),
});

export const updateAdminSchema = createAdminSchema.partial().omit({ password: true });

export const emailVerifyRequestSchema = z.object({});
export const verifyCodeSchema = z.object({
  email: z.string().trim().email().max(180).optional(),
  phone: z.string().trim().max(30).optional(),
  code: z.string().trim().min(4).max(10),
});
export const smsVerifyRequestSchema = z.object({});

/* ------------------------------ 2FA ------------------------------ */

export const twoFaMethodsSchema = z.object({
  methods: z.array(z.enum(['AUTHENTICATOR', 'SMS', 'EMAIL'])).min(1),
  enabled: z.boolean().optional(),
});

export const twoFaAuthenticatorVerifySchema = z.object({
  token: z.string().trim().min(6).max(8),
});

export const twoFaChallengeSendSchema = z.object({
  challengeToken: z.string().min(10),
  method: z.enum(['SMS', 'EMAIL']),
});

export const twoFaChallengeVerifySchema = z.object({
  challengeToken: z.string().min(10),
  method: z.enum(TWO_FA_METHODS),
  code: z.string().trim().min(4).max(10).optional(),
  token: z.string().trim().min(6).max(8).optional(),
});

/* ------------------------------------------------------------------ */
/* Shops                                                               */
/* ------------------------------------------------------------------ */

export const createShopSchema = z.object({
  name: z.string().trim().min(2).max(150),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().email().max(180).optional(),
  address: z.string().trim().max(500).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  pincode: z.string().trim().max(20).optional(),
  gstNumber: z.string().trim().max(20).optional(),
  shopType: z.enum(SHOP_TYPES).optional(),
  currency: z.string().trim().length(3).default('INR'),
  timezone: z.string().trim().max(60).default('Asia/Kolkata'),
});

export const updateShopSchema = createShopSchema.partial();
export const switchShopSchema = z.object({ shopId: uuidSchema });

export const inviteMemberSchema = z.object({
  fullName: z.string().trim().min(2).max(150),
  email: z.string().trim().email().max(180).optional(),
  phone: z.string().trim().min(7).max(30),
  role: z.enum(USER_ROLES).default('STAFF'),
  permissions: z.array(z.enum(SHOP_PERMISSIONS)).optional(),
});

export const updateMemberSchema = z.object({
  role: z.enum(USER_ROLES).optional(),
  permissions: z.array(z.enum(SHOP_PERMISSIONS)).optional(),
  status: z.enum(MEMBERSHIP_STATUSES).optional(),
});

/* ------------------------------------------------------------------ */
/* Inventory                                                           */
/* ------------------------------------------------------------------ */

export const categorySchema = z.object({
  name: z.string().trim().min(1).max(120),
  parentId: uuidSchema.nullable().optional(),
  description: z.string().trim().max(500).optional(),
  imageUrl: z.string().trim().url().max(500).optional(),
});

export const brandSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  logoUrl: z.string().trim().url().max(500).optional(),
});

const productImageSchema = z.object({
  url: z.string().trim().url().max(500),
  isPrimary: z.boolean().default(false),
  sortOrder: z.number().int().min(0).default(0),
});

const productVariantInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  sku: z.string().trim().max(60).optional(),
  barcode: z.string().trim().max(60).optional(),
  qrCode: z.string().trim().max(120).optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  purchasePrice: moneySchema.optional(),
  sellingPrice: moneySchema.optional(),
  currentStock: quantitySchema.optional(),
  reorderLevel: quantitySchema.optional(),
});

const productBatchInputSchema = z.object({
  batchNumber: z.string().trim().min(1).max(60),
  manufacturingDate: z.string().optional(),
  expiryDate: z.string().optional(),
  quantity: quantitySchema.default('0'),
  purchasePrice: moneySchema.optional(),
  sellingPrice: moneySchema.optional(),
});

export const productCreateSchema = z.object({
  categoryId: uuidSchema.optional(),
  brandId: uuidSchema.optional(),
  name: z.string().trim().min(1).max(200),
  sku: z.string().trim().max(60).optional(),
  barcode: z.string().trim().max(60).optional(),
  qrCode: z.string().trim().max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  unit: z.string().trim().max(20).default('pcs'),
  purchasePrice: moneySchema.default('0'),
  sellingPrice: moneySchema.default('0'),
  mrp: moneySchema.optional(),
  taxRate: rateSchema.default('0'),
  hsnCode: z.string().trim().max(20).optional(),
  currentStock: quantitySchema.default('0'),
  reorderLevel: quantitySchema.default('0'),
  isActive: z.boolean().default(true),
  images: z.array(productImageSchema).max(10).optional(),
  variants: z.array(productVariantInputSchema).max(50).optional(),
  batches: z.array(productBatchInputSchema).max(50).optional(),
});

export const productUpdateSchema = productCreateSchema.partial().omit({
  images: true,
  variants: true,
  batches: true,
});

export const productQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(100).optional(),
  categoryId: uuidSchema.optional(),
  brandId: uuidSchema.optional(),
  isActive: z.coerce.boolean().optional(),
  lowStock: z.coerce.boolean().optional(),
  sortBy: z.enum(['name', 'createdAt', 'sellingPrice', 'currentStock']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/* ------------------------------------------------------------------ */
/* Stock                                                               */
/* ------------------------------------------------------------------ */

export const warehouseSchema = z.object({
  name: z.string().trim().min(1).max(150),
  code: z.string().trim().max(30).optional(),
  address: z.string().trim().max(500).optional(),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

const stockItemSchema = z.object({
  productId: uuidSchema,
  variantId: uuidSchema.optional(),
  batchId: uuidSchema.optional(),
  batchNumber: z.string().trim().max(60).optional(),
  expiryDate: z.string().optional(),
  manufacturingDate: z.string().optional(),
  quantity: quantitySchema,
  unitCost: moneySchema.optional(),
});

export const stockInSchema = z.object({
  warehouseId: uuidSchema,
  referenceType: z.enum(['MANUAL', 'PURCHASE', 'ADJUSTMENT']).default('MANUAL'),
  referenceId: uuidSchema.optional(),
  notes: z.string().trim().max(500).optional(),
  items: z.array(stockItemSchema).min(1).max(100),
});

export const stockOutSchema = z.object({
  warehouseId: uuidSchema,
  referenceType: z.enum(['MANUAL', 'SALE', 'ADJUSTMENT']).default('MANUAL'),
  referenceId: uuidSchema.optional(),
  notes: z.string().trim().max(500).optional(),
  items: z.array(stockItemSchema.omit({ batchNumber: true, expiryDate: true, manufacturingDate: true, unitCost: true })).min(1).max(100),
});

export const stockTransferSchema = z.object({  fromWarehouseId: uuidSchema,
  toWarehouseId: uuidSchema,
  notes: z.string().trim().max(500).optional(),
  items: z.array(z.object({
    productId: uuidSchema,
    variantId: uuidSchema.optional(),
    batchId: uuidSchema.optional(),
    quantity: quantitySchema,
  })).min(1).max(100),
}).refine((v) => v.fromWarehouseId !== v.toWarehouseId, {
  message: 'Source and destination warehouses must differ',
});

export const stockLevelsQuerySchema = paginationSchema.extend({
  warehouseId: uuidSchema.optional(),
  productId: uuidSchema.optional(),
  search: z.string().trim().max(100).optional(),
});

export const stockPurchaseUpdateSchema = stockInSchema.extend({
  warehouseId: uuidSchema.optional(),
});

export const salesDeductionSchema = stockOutSchema.extend({
  warehouseId: uuidSchema.optional(),
});

export const stockMovementsQuerySchema = paginationSchema.extend({
  productId: uuidSchema.optional(),
  warehouseId: uuidSchema.optional(),
  type: z.enum(STOCK_MOVEMENT_TYPES).optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});

/* ------------------------------------------------------------------ */
/* Purchases                                                           */
/* ------------------------------------------------------------------ */

const purchaseItemSchema = z.object({
  productId: uuidSchema,
  variantId: uuidSchema.optional(),
  batchNumber: z.string().trim().max(60).optional(),
  quantity: quantitySchema,
  unitCost: moneySchema,
  taxRate: rateSchema.default('0'),
});

export const purchaseCreateSchema = z.object({
  supplierId: uuidSchema.optional(),
  purchaseNumber: z.string().trim().max(40).optional(),
  purchaseDate: z.string().optional(),
  warehouseId: uuidSchema.optional(),
  notes: z.string().trim().max(1000).optional(),
  items: z.array(purchaseItemSchema).min(1).max(200),
});

export const purchaseUpdateSchema = z.object({
  supplierId: uuidSchema.nullable().optional(),
  purchaseDate: z.string().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  status: z.enum(['DRAFT', 'RECEIVED', 'CANCELLED']).optional(),
});

/* ------------------------------------------------------------------ */
/* Billing                                                             */
/* ------------------------------------------------------------------ */

const invoiceItemSchema = z.object({
  productId: uuidSchema.optional(),
  variantId: uuidSchema.optional(),
  description: z.string().trim().min(1).max(300),
  hsnCode: z.string().trim().max(20).optional(),
  quantity: quantitySchema,
  unitPrice: moneySchema,
  discountRate: rateSchema.default('0'),
  gstRate: rateSchema.default('0'),
});

export const invoiceCreateSchema = z.object({
  customerId: uuidSchema.optional(),
  invoiceNumber: z.string().trim().max(40).optional(),
  status: z.enum(INVOICE_STATUSES).default('ISSUED'),
  issueDate: z.string().optional(),
  dueDate: z.string().optional(),
  placeOfSupply: z.string().trim().max(100).optional(),
  customerGstNumber: z.string().trim().max(20).optional(),
  isInterState: z.boolean().default(false),
  notes: z.string().trim().max(2000).optional(),
  terms: z.string().trim().max(2000).optional(),
  items: z.array(invoiceItemSchema).min(1).max(200),
});

export const invoiceUpdateSchema = z.object({
  customerId: uuidSchema.nullable().optional(),
  status: z.enum(INVOICE_STATUSES).optional(),
  dueDate: z.string().nullable().optional(),
  placeOfSupply: z.string().trim().max(100).nullable().optional(),
  customerGstNumber: z.string().trim().max(20).nullable().optional(),
  isInterState: z.boolean().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  terms: z.string().trim().max(2000).nullable().optional(),
});

export const invoiceQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(100).optional(),
  status: z.enum(INVOICE_STATUSES).optional(),
  customerId: uuidSchema.optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});

export const paymentCreateSchema = z.object({
  invoiceId: uuidSchema.optional(),
  purchaseId: uuidSchema.optional(),
  customerId: uuidSchema.optional(),
  supplierId: uuidSchema.optional(),
  amount: moneySchema,
  mode: z.enum(PAYMENT_MODES).default('CASH'),
  direction: z.enum(PAYMENT_DIRECTIONS).default('IN'),
  paymentDate: z.string().optional(),
  referenceNumber: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const paymentQuerySchema = paginationSchema.extend({
  invoiceId: uuidSchema.optional(),
  customerId: uuidSchema.optional(),
  direction: z.enum(PAYMENT_DIRECTIONS).optional(),
  mode: z.enum(PAYMENT_MODES).optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});

export const shareInvoiceSchema = z.object({
  channel: z.enum(['LINK', 'SMS', 'WHATSAPP']).default('LINK'),
  expiresInHours: z.coerce.number().int().min(1).max(24 * 30).default(72),
});

export const smsLinkSchema = z.object({
  phone: z.string().trim().min(7).max(30).optional(),
  message: z.string().trim().max(500).optional(),
});

/* ------------------------------------------------------------------ */
/* Customers                                                           */
/* ------------------------------------------------------------------ */

export const customerCreateSchema = z.object({
  name: z.string().trim().min(1).max(150),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().email().max(180).optional(),
  address: z.string().trim().max(500).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  pincode: z.string().trim().max(20).optional(),
  gstNumber: z.string().trim().max(20).optional(),
  creditLimit: moneySchema.default('0'),
  notes: z.string().trim().max(1000).optional(),
});

export const customerUpdateSchema = customerCreateSchema.partial();

export const customerQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(100).optional(),
  hasDue: z.coerce.boolean().optional(),
});

export const reminderSchema = z.object({
  invoiceId: uuidSchema.optional(),
  phone: z.string().trim().min(7).max(30).optional(),
  message: z.string().trim().max(500).optional(),
});

/* ------------------------------------------------------------------ */
/* Finance                                                             */
/* ------------------------------------------------------------------ */

export const financeCategorySchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(['INCOME', 'EXPENSE']),
  description: z.string().trim().max(500).optional(),
});

export const revenueCreateSchema = z.object({
  categoryId: uuidSchema.optional(),
  title: z.string().trim().min(1).max(200),
  amount: moneySchema,
  revenueDate: z.string().optional(),
  source: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const expenseCreateSchema = z.object({
  categoryId: uuidSchema.optional(),
  title: z.string().trim().min(1).max(200),
  amount: moneySchema,
  expenseDate: z.string().optional(),
  paymentMode: z.enum(PAYMENT_MODES).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const assetCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  assetType: z.string().trim().max(80).optional(),
  purchaseValue: moneySchema,
  currentValue: moneySchema,
  purchaseDate: z.string().optional(),
  status: z.enum(['ACTIVE', 'DISPOSED']).default('ACTIVE'),
  notes: z.string().trim().max(1000).optional(),
});

export const liabilityCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  liabilityType: z.string().trim().max(80).optional(),
  totalAmount: moneySchema,
  outstandingAmount: moneySchema,
  dueDate: z.string().optional(),
  status: z.enum(['OPEN', 'CLOSED']).default('OPEN'),
  notes: z.string().trim().max(1000).optional(),
});

/* ------------------------------------------------------------------ */
/* Subscriptions                                                       */
/* ------------------------------------------------------------------ */

export const subscriptionChangeSchema = z.object({
  planCode: z.enum(PLAN_CODES),
  billingCycle: z.enum(BILLING_CYCLES).default('MONTHLY'),
  startTrial: z.boolean().default(false),
});

export const subscriptionAssignSchema = z.object({
  planCode: z.enum(PLAN_CODES),
  billingCycle: z.enum(BILLING_CYCLES).default('MONTHLY'),
  status: z.enum(['TRIAL', 'ACTIVE']).default('ACTIVE'),
  trialDays: z.coerce.number().int().min(0).max(90).default(0),
});

/* ------------------------------------------------------------------ */
/* Referrals                                                           */
/* ------------------------------------------------------------------ */

export const referralCodeCreateSchema = z.object({
  code: z.string().trim().min(3).max(32).optional(),
  maxUses: z.coerce.number().int().min(1).max(100000).optional(),
  rewardAmount: moneySchema.default('0'),
  expiresAt: z.string().optional(),
  notes: z.string().trim().max(500).optional(),
});

export const referralTrackSchema = z.object({
  code: z.string().trim().min(3).max(32),
  referredShopId: uuidSchema.optional(),
  referredAccountId: uuidSchema.optional(),
  notes: z.string().trim().max(500).optional(),
});

export const referralRewardSchema = z.object({
  rewardAmount: moneySchema,
  notes: z.string().trim().max(500).optional(),
});

export const couponCreateSchema = z.object({
  code: z.string().trim().min(3).max(32).optional(),
  discountType: z.enum(['PERCENT', 'FLAT']),
  discountValue: moneySchema,
  validFrom: z.string().optional(),
  validTo: z.string().optional(),
  usageLimit: z.coerce.number().int().min(1).optional(),
  description: z.string().trim().max(500).optional(),
});

/* ------------------------------------------------------------------ */
/* Audit / notifications / admin                                       */
/* ------------------------------------------------------------------ */

export const auditQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(200).optional(),
  entityType: z.string().trim().max(80).optional(),
  entityId: uuidSchema.optional(),
  action: z.string().trim().max(80).optional(),
  category: z.string().trim().max(40).optional(),
  severity: z.enum(['INFO', 'MEDIUM', 'HIGH']).optional(),
  actorType: z.enum(['account', 'admin']).optional(),
  actorId: z.string().trim().max(80).optional(),
  ipAddress: z.string().trim().max(60).optional(),
  shopId: uuidSchema.optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});

export const ticketCreateSchema = z.object({
  shopId: uuidSchema.optional(),
  subject: z.string().trim().min(3).max(200),
  description: z.string().trim().min(3).max(5000),
  category: z.string().trim().max(80).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
});

export const ticketUpdateSchema = z.object({
  subject: z.string().trim().min(3).max(200).optional(),
  description: z.string().trim().min(3).max(5000).optional(),
  category: z.string().trim().max(80).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
  assignedToAdminId: uuidSchema.nullable().optional(),
});

export const approvalReviewSchema = z.object({
  note: z.string().trim().max(1000).optional(),
});

export const profileChangeRequestSchema = z.object({
  entityType: z.enum(['account', 'shop', 'membership']),
  entityId: uuidSchema.optional(),
  changes: z.record(z.string(), z.unknown()),
  reason: z.string().trim().max(1000).optional(),
});

export const settingsUpdateSchema = z.object({
  settings: z.record(z.string(), z.unknown()),
});

export const adminShopCreateSchema = createShopSchema.extend({
  ownerAccountId: uuidSchema.optional(),
  status: z.enum(SHOP_STATUSES).default('ACTIVE'),
});

export const adminShopUpdateSchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  email: z.string().trim().email().max(180).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  city: z.string().trim().max(100).nullable().optional(),
  state: z.string().trim().max(100).nullable().optional(),
  pincode: z.string().trim().max(20).nullable().optional(),
  gstNumber: z.string().trim().max(20).nullable().optional(),
  status: z.enum(SHOP_STATUSES).optional(),
});

export const adminUserUpdateSchema = z.object({
  fullName: z.string().trim().min(2).max(150).optional(),
  email: z.string().trim().email().max(180).nullable().optional(),
  phone: z.string().trim().min(7).max(30).optional(),
  status: z.enum(['ACTIVE', 'PENDING', 'SUSPENDED', 'BLOCKED']).optional(),
});

export const adminResetPasswordSchema = z.object({
  newPassword: z.string().min(8).max(100),
});

export type RegisterShopOwnerInput = z.infer<typeof registerShopOwnerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type InvoiceCreateInput = z.infer<typeof invoiceCreateSchema>;
export type PaymentCreateInput = z.infer<typeof paymentCreateSchema>;
export type ProductCreateInput = z.infer<typeof productCreateSchema>;

/* ------------------------------------------------------------------ */
/* Finance — update/query companions                                   */
/* ------------------------------------------------------------------ */

export const financeCategoryQuerySchema = paginationSchema.extend({
  type: z.enum(['INCOME', 'EXPENSE']).optional(),
});

export const revenueUpdateSchema = revenueCreateSchema.partial();
export const expenseUpdateSchema = expenseCreateSchema.partial();
export const assetUpdateSchema = assetCreateSchema.partial();
export const liabilityUpdateSchema = liabilityCreateSchema.partial();

const financeListQuery = paginationSchema.extend({
  categoryId: uuidSchema.optional(),
  search: z.string().trim().max(100).optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});

export const revenueQuerySchema = financeListQuery;
export const expenseQuerySchema = financeListQuery;
export const assetQuerySchema = financeListQuery;
export const liabilityQuerySchema = financeListQuery;

/* ------------------------------------------------------------------ */
/* Subscriptions — cancel                                              */
/* ------------------------------------------------------------------ */

export const subscriptionCancelSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

export const notificationQuerySchema = paginationSchema.extend({
  type: z.enum(['INFO', 'WARNING', 'ALERT', 'SYSTEM']).optional(),
  unreadOnly: z.coerce.boolean().default(false),
});

/* ------------------------------------------------------------------ */
/* Support tickets — replies                                           */
/* ------------------------------------------------------------------ */

export const ticketReplySchema = z.object({
  message: z.string().trim().min(1).max(5000),
  isInternal: z.boolean().default(false),
});

export const ticketListQuerySchema = paginationSchema.extend({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  search: z.string().trim().max(200).optional(),
});

/* ------------------------------------------------------------------ */
/* Subscription plans (platform admin)                                 */
/* ------------------------------------------------------------------ */

export const planCreateSchema = z.object({
  code: z.enum(PLAN_CODES),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(1000).optional(),
  monthlyPrice: moneySchema,
  yearlyPrice: moneySchema,
  currency: z.string().trim().length(3).default('INR'),
  trialDays: z.coerce.number().int().min(0).max(365).default(0),
  features: z.array(z.string().trim().min(1).max(80)).default([]),
  limits: z.record(z.string(), z.coerce.number().int().min(-1)).default({}),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export const planUpdateSchema = planCreateSchema.partial().omit({ code: true });

/* ------------------------------------------------------------------ */
/* HR: attendance + salary                                             */
/* ------------------------------------------------------------------ */

export const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'HALF_DAY', 'PAID_LEAVE', 'WEEKLY_OFF'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const attendanceDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

export const attendanceMarkSchema = z.object({
  date: attendanceDateSchema,
  records: z
    .array(
      z.object({
        membershipId: uuidSchema,
        status: z.enum(ATTENDANCE_STATUSES),
        notes: z.string().trim().max(500).optional(),
      }),
    )
    .min(1)
    .max(500),
});

export const attendanceQuerySchema = z.object({
  date: attendanceDateSchema.optional(),
  fromDate: attendanceDateSchema.optional(),
  toDate: attendanceDateSchema.optional(),
  membershipId: uuidSchema.optional(),
});

export const salaryStructureSchema = z.object({
  monthlySalary: moneySchema,
  effectiveFrom: attendanceDateSchema.optional(),
});

export const salaryAdvanceSchema = z.object({
  membershipId: uuidSchema,
  amount: moneySchema,
  advanceDate: attendanceDateSchema.optional(),
  notes: z.string().trim().max(500).optional(),
});

export const salaryPaySchema = z.object({
  membershipId: uuidSchema,
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  bonus: moneySchema.optional(),
  deductions: moneySchema.optional(),
  mode: z.enum(['CASH', 'UPI', 'BANK_TRANSFER']).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const salaryQuerySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  membershipId: uuidSchema.optional(),
});

/* ------------------------------------------------------------------ */
/* Expense Tracker (standalone /api/v1/expenses on the Expense model)  */
/* ------------------------------------------------------------------ */

export const EXPENSE_CATEGORIES = ['RENT', 'SALARY', 'UTILITIES', 'SUPPLIES', 'OTHER'] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const expenseTrackerDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

export const expenseTrackerCreateSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  title: z.string().trim().min(1, 'Description is required').max(200),
  amount: moneySchema,
  expenseDate: expenseTrackerDateSchema,
  paidBy: z.string().trim().max(200).optional(),
  paymentMode: z.enum(PAYMENT_MODES).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const expenseTrackerUpdateSchema = expenseTrackerCreateSchema.partial();

export const expenseTrackerQuerySchema = paginationSchema.extend({
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  search: z.string().trim().max(100).optional(),
  fromDate: expenseTrackerDateSchema.optional(),
  toDate: expenseTrackerDateSchema.optional(),
});

export const expenseTrackerSummarySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});
