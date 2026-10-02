// API response types — matches RaghuMayaShop /api/v1 contract (PROJECT_SPEC.md §5).

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
}

export interface ListResponse<T> {
  data: T[];
  meta: PageMeta;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}

// ---- Auth ----
export interface LoginSuccess {
  accessToken: string;
  refreshToken: string;
  account?: Account;
  memberships?: ShopMembership[];
}

export interface LoginChallenge {
  twoFactorRequired: true;
  challengeToken: string;
  methods: string[];
  expiresAt: string;
}

export type LoginResponse = LoginSuccess | LoginChallenge;

export function isChallenge(r: LoginResponse): r is LoginChallenge {
  return (r as LoginChallenge).twoFactorRequired === true;
}

export interface Account {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role?: string;
}

export interface Shop {
  id: string;
  name: string;
  city?: string | null;
  state?: string | null;
  gstNumber?: string | null;
  role?: string;
}

export interface ShopMembership {
  shopId: string;
  shop?: Shop;
  role: string;
  status: string;
  permissions?: string[];
}

export interface ShopMember {
  id: string;
  accountId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  role: string;
  status: string;
  permissions?: string[];
  // API nests identity under `account`; flattened into name/email/phone by useShopMembers
  account?: {
    id?: string;
    fullName?: string | null;
    email?: string | null;
    phone?: string | null;
    status?: string;
  } | null;
}

// ---- Inventory ----
export interface Category {
  id: string;
  name: string;
  parentId?: string | null;
}

export interface Product {
  id: string;
  shopId: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  qrCode?: string | null;
  categoryId?: string | null;
  category?: Category | null;
  brand?: { id: string; name: string } | null;
  sellingPrice: string;
  mrp?: string | null;
  purchasePrice?: string | null;
  gstRate?: string | null;
  unit?: string | null;
  currentStock: string;
  minStockLevel?: string | null;
  imageUrl?: string | null;
}

export interface StockLevel {
  id: string;
  productId: string;
  product?: Product | null;
  warehouseId: string;
  warehouse?: { id: string; name: string } | null;
  quantity: string;
  reservedQuantity?: string;
}

export interface StockMovement {
  id: string;
  productId: string;
  product?: Product | null;
  type: string;
  quantity: string;
  referenceType?: string | null;
  referenceId?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface LowStockAlert {
  productId: string;
  product?: Product | null;
  productName?: string;
  currentStock: string;
  minStockLevel: string;
}

// ---- Billing ----
export type InvoiceStatus =
  | 'DRAFT'
  | 'ISSUED'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'OVERDUE'
  | 'CANCELLED';

export interface InvoiceItem {
  id: string;
  productId?: string | null;
  description: string;
  quantity: string;
  unitPrice: string;
  discountRate?: string | null;
  gstRate?: string | null;
  lineTotal?: string | null;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  customerId?: string | null;
  customer?: Customer | null;
  status: InvoiceStatus;
  issueDate: string;
  dueDate?: string | null;
  subtotal: string;
  discountTotal: string;
  cgstTotal: string;
  sgstTotal: string;
  igstTotal: string;
  grandTotal: string;
  paidAmount: string;
  balanceDue: string;
  items?: InvoiceItem[];
  notes?: string | null;
  createdAt: string;
}

export interface CreateInvoicePayload {
  customerId?: string;
  invoiceNumber?: string;
  status: 'DRAFT' | 'ISSUED';
  issueDate: string;
  dueDate?: string;
  placeOfSupply?: string;
  isInterState?: boolean;
  items: {
    productId?: string;
    description: string;
    quantity: string;
    unitPrice: string;
    discountRate?: string;
    gstRate?: string;
  }[];
  notes?: string;
}

export interface Payment {
  id: string;
  invoiceId?: string | null;
  customerId?: string | null;
  amount: string;
  mode: string;
  direction: string;
  createdAt: string;
}

// ---- Customers ----
export interface Customer {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  gstNumber?: string | null;
  creditLimit?: string | null;
  currentBalance?: string | null;
  totalDue?: string | null;
}

export interface LedgerEntry {
  id: string;
  date: string;
  type: 'INVOICE' | 'PAYMENT';
  reference?: string | null;
  debit: string;
  credit: string;
  balance: string;
  notes?: string | null;
}

export interface CustomerLedger {
  customer: Customer;
  entries: LedgerEntry[];
  openingBalance: string;
  closingBalance: string;
}

// ---- Analytics / Finance ----
export interface AnalyticsDashboard {
  todaySales: string;
  monthSales: string;
  totalOutstanding: string;
  lowStockCount: number;
  totalProducts: number;
  totalCustomers: number;
}

export interface DailySale {
  date: string;
  total: string;
}

export interface TopProduct {
  productId: string;
  productName: string;
  quantity: string;
  revenue: string;
}

export interface FinanceDashboard {
  totalRevenue: string;
  totalExpenses: string;
  netProfit: string;
  totalAssets: string;
  totalLiabilities: string;
}

export interface SubscriptionInfo {
  planCode: string;
  status: string;
  currentPeriodEnd?: string | null;
}
