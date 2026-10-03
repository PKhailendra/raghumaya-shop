// RaghuMayaShop API client — typed wrappers over the /api/v1 contract.
// Access token is kept in memory; refresh happens automatically on 401.
//
// Every adapter below maps the backend's real response shape (raw Prisma
// records inside { data, meta } envelopes) onto the flat DTOs the pages use.

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
const REFRESH_COOKIE = "rms_rt";

let accessToken: string | null = null;
let refreshPromise: Promise<boolean> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

function getRefreshToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${REFRESH_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function setRefreshToken(token: string | null) {
  if (typeof document === "undefined") return;
  if (token) {
    document.cookie = `${REFRESH_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
  } else {
    document.cookie = `${REFRESH_COOKIE}=; path=/; max-age=0`;
  }
}

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

type RequestOptions = {
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
};

async function refreshAccessToken(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const rt = getRefreshToken();
      if (!rt) return false;
      try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: rt }),
        });
        if (!res.ok) return false;
        const json = await res.json();
        setAccessToken(json.accessToken ?? null);
        if (json.refreshToken) setRefreshToken(json.refreshToken);
        return !!json.accessToken;
      } catch {
        return false;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

async function request<T>(method: string, path: string, opts: RequestOptions = {}, retried = false): Promise<T> {
  const url = new URL(API_BASE + path);
  if (opts.params) {
    for (const [k, v] of Object.entries(opts.params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
  const res = await fetch(url.toString(), {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401 && !retried && getRefreshToken()) {
    const ok = await refreshAccessToken();
    if (ok) return request<T>(method, path, opts, true);
    setRefreshToken(null);
    setAccessToken(null);
    throw new ApiError("UNAUTHORIZED", "Your session has expired. Please log in again.", 401);
  }
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = json?.error ?? {};
    throw new ApiError(err.code ?? "REQUEST_FAILED", err.message ?? `Request failed (${res.status})`, res.status);
  }
  return json as T;
}

const get = <T>(path: string, params?: RequestOptions["params"]) => request<T>("GET", path, { params });
const post = <T>(path: string, body?: unknown) => request<T>("POST", path, { body });
const patch = <T>(path: string, body?: unknown) => request<T>("PATCH", path, { body });
const put = <T>(path: string, body?: unknown) => request<T>("PUT", path, { body });
const del = <T>(path: string) => request<T>("DELETE", path);

/** Unwrap a { data } envelope or pass a bare array through. */
const asArray = <T>(raw: unknown): T[] => {
  if (Array.isArray(raw)) return raw as T[];
  const data = (raw as { data?: unknown })?.data;
  return Array.isArray(data) ? (data as T[]) : [];
};

/** Convert the backend's from/to shorthand into its fromDate/toDate query params. */
const dateRangeParams = (params?: { from?: string; to?: string; fromDate?: string; toDate?: string } & Record<string, unknown>) => {
  if (!params) return undefined;
  const { from, to, ...rest } = params as { from?: string; to?: string } & Record<string, unknown>;
  return {
    ...rest,
    ...(from && !params.fromDate ? { fromDate: from } : {}),
    ...(to && !params.toDate ? { toDate: to } : {}),
  } as Record<string, string | number | boolean | undefined>;
};

// ---------- Shared shapes ----------
export type ListResponse<T> = { data: T[]; meta: { page: number; limit: number; total: number } };
export type PageParams = { page?: number; limit?: number; search?: string };

const num = (v: unknown) => {
  const n = typeof v === "string" || typeof v === "number" ? Number(v) : 0;
  return Number.isFinite(n) ? n : 0;
};

// ---------- Auth ----------
export type AccountType = "admin" | "shop";
export type LoginResponse =
  | { accessToken: string; refreshToken: string; account: Account; requiresTwoFactor: false }
  | { requiresTwoFactor: true; challengeId: string; methods: string[] };

export type Account = {
  id: string;
  type: AccountType;
  email: string;
  name: string;
  role: string; // admin role or shop role
  status: string;
  activeShopId?: string | null;
  memberships: Membership[];
  createdAt: string;
};

export type Membership = {
  shopId: string;
  shopName: string;
  role: string;
  permissions: string[];
};

type RawActor = {
  actorType: "account" | "admin";
  id: string;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  activeShopId?: string | null;
};

type RawLoginResponse =
  | { accessToken: string; refreshToken: string; actor: RawActor; twoFactorRequired?: false }
  | { twoFactorRequired: true; challengeToken: string; methods: string[]; actor?: RawActor };

const toAccount = (a: RawActor): Account => ({
  id: a.id,
  type: a.actorType === "admin" ? "admin" : "shop",
  email: a.email ?? "",
  name: a.fullName ?? "",
  role: a.role ?? "",
  status: "ACTIVE",
  activeShopId: a.activeShopId ?? null,
  memberships: [],
  createdAt: new Date().toISOString(),
});

const toLoginResponse = (raw: RawLoginResponse): LoginResponse => {
  if (raw.twoFactorRequired) {
    return { requiresTwoFactor: true, challengeId: raw.challengeToken, methods: raw.methods ?? [] };
  }
  return {
    accessToken: raw.accessToken,
    refreshToken: raw.refreshToken,
    account: toAccount(raw.actor),
    requiresTwoFactor: false,
  };
};

export type Device = {
  id: string;
  deviceName: string;
  deviceType?: string;
  ipAddress?: string;
  lastUsedAt?: string;
  createdAt: string;
};

const mapDevice = (d: Record<string, any>): Device => ({
  id: d.id,
  deviceName: d.deviceName ?? d.name ?? "Unknown device",
  deviceType: d.deviceType ?? d.type,
  ipAddress: d.ipAddress,
  lastUsedAt: d.lastUsedAt ?? d.lastSeenAt,
  createdAt: d.createdAt,
});

export const authApi = {
  login: async (body: { emailOrPhone: string; password: string }): Promise<LoginResponse> =>
    toLoginResponse(await post<RawLoginResponse>("/auth/login", body)),
  registerShopOwner: (body: Record<string, unknown>) => post("/auth/register-shop-owner", body),
  logout: () => post("/auth/logout"),
  refresh: (refreshToken: string) => post<{ accessToken: string; refreshToken: string }>("/auth/refresh", { refreshToken }),
  changePassword: (body: { currentPassword: string; newPassword: string }) => post("/auth/change-password", body),
  forgotPassword: (body: { email: string }) => post("/auth/forgot-password", body),
  resetPassword: (body: { token: string; newPassword: string }) => post("/auth/reset-password", body),
  otpRequest: (body: { email?: string; phone?: string; purpose: string }) => post("/auth/otp/request", body),
  otpVerify: (body: { email?: string; phone?: string; code: string; purpose?: string }) => post("/auth/otp/verify", body),
  challengeSend: (body: { challengeId: string; method: string }) => post("/auth/2fa/challenge/send", body),
  challengeVerify: (body: { challengeId: string; code: string }) =>
    post<{ accessToken: string; refreshToken: string; account: Account }>("/auth/2fa/challenge/verify", body),
  twoFactorStatus: () => get<{ enabled: boolean; methods: string[] }>("/auth/2fa/status"),
  devices: async (): Promise<Device[]> => asArray<Record<string, any>>(await get<unknown>("/auth/devices")).map(mapDevice),
  deleteDevice: (id: string) => del(`/auth/devices/${id}`),
};

// ---------- Shops ----------
export const SHOP_TYPE_OPTIONS = [
  { value: "RETAIL", label: "Retail" },
  { value: "WHOLESALE", label: "Wholesale" },
  { value: "DISTRIBUTOR", label: "Distributor" },
  { value: "SERVICE", label: "Service" },
  { value: "MANUFACTURING", label: "Manufacturing" },
  { value: "ONLINE", label: "Online" },
  { value: "OTHER", label: "Other" },
] as const;

export function shopTypeLabel(value?: string | null): string {
  return SHOP_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? "-";
}

export type Shop = {
  id: string;
  name: string;
  shopType?: string;
  gstNumber?: string;
  phone?: string;
  email?: string;
  address?: Record<string, string>;
  status: string;
  ownerName?: string;
  createdAt: string;
  updatedAt: string;
};

export type ShopMember = {
  id: string;
  accountId: string;
  name: string;
  email?: string;
  phone?: string;
  role: string;
  status: string;
  permissions: string[];
  joinedAt: string;
};

const mapMember = (m: Record<string, any>): ShopMember => ({
  id: m.id,
  accountId: m.accountId,
  name: m.account?.fullName ?? m.name ?? "",
  email: m.account?.email ?? m.email,
  phone: m.account?.phone ?? m.phone,
  role: m.role,
  status: m.account?.status ?? m.status,
  permissions: m.permissions ?? [],
  joinedAt: m.joinedAt,
});

export const shopsApi = {
  myShops: () => get<Shop[]>("/shops"),
  context: () => get<{ shop: Shop; membershipId: string; role: string; permissions: string[] }>("/shops/context"),
  get: (id: string) => get<Shop>(`/shops/${id}`),
  create: (body: Record<string, unknown>) => post<Shop>("/shops", body),
  update: (id: string, body: Record<string, unknown>) => patch<Shop>(`/shops/${id}`, body),
  switch: (shopId: string) => post<{ accessToken: string; account: Account }>("/shops/switch", { shopId }),
  members: async (id: string): Promise<ShopMember[]> =>
    asArray<Record<string, any>>(await get<unknown>(`/shops/${id}/members`)).map(mapMember),
  inviteMember: (id: string, body: Record<string, unknown>) => post<ShopMember>(`/shops/${id}/members/invite`, body),
  updateMember: (id: string, memberId: string, body: Record<string, unknown>) =>
    patch<ShopMember>(`/shops/${id}/members/${memberId}`, body),
  removeMember: (id: string, memberId: string) => del(`/shops/${id}/members/${memberId}`),
};

// ---------- Inventory ----------
export type Category = { id: string; name: string; parentId?: string | null; description?: string };
export type Brand = { id: string; name: string };
export type ProductVariant = { id?: string; name: string; sku?: string; barcode?: string; price?: string; stockQuantity?: number };
export type ProductBatch = {
  id?: string;
  batchNumber: string;
  quantity: number;
  manufacturingDate?: string;
  expiryDate?: string;
};
export type ProductImage = { id?: string; url: string; isPrimary?: boolean; sortOrder?: number };
export type Product = {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  qrCode?: string;
  description?: string;
  categoryId?: string;
  brandId?: string;
  category?: Category;
  brand?: Brand;
  purchasePrice?: string;
  sellingPrice: string;
  mrp?: string;
  gstRate?: string;
  taxRate?: string;
  hsnCode?: string;
  currentStock: number;
  reorderLevel?: number;
  isActive?: boolean;
  unit?: string;
  images?: ProductImage[];
  variants?: ProductVariant[];
  batches?: ProductBatch[];
  createdAt: string;
};

export const inventoryApi = {
  categories: (params?: PageParams) => get<ListResponse<Category> | Category[]>("/inventory/categories", params),
  createCategory: (body: Record<string, unknown>) => post<Category>("/inventory/categories", body),
  updateCategory: (id: string, body: Record<string, unknown>) => patch<Category>(`/inventory/categories/${id}`, body),
  deleteCategory: (id: string) => del(`/inventory/categories/${id}`),
  brands: (params?: PageParams) => get<ListResponse<Brand> | Brand[]>("/inventory/brands", params),
  createBrand: (body: Record<string, unknown>) => post<Brand>("/inventory/brands", body),
  products: (params?: PageParams & { categoryId?: string; brandId?: string; lowStock?: boolean }) =>
    get<ListResponse<Product>>("/inventory/products", params),
  lookup: (type: "barcode" | "qr", code: string) =>
    get<Product>("/inventory/products/lookup", { type, code }),
  getProduct: (id: string) => get<Product>(`/inventory/products/${id}`),
  createProduct: (body: Record<string, unknown>) => post<Product>("/inventory/products", body),
  updateProduct: (id: string, body: Record<string, unknown>) => patch<Product>(`/inventory/products/${id}`, body),
  deleteProduct: (id: string) => del(`/inventory/products/${id}`),
};

// ---------- Stock ----------
export type Warehouse = { id: string; name: string; location?: string; isDefault?: boolean };
export type StockLevel = {
  id: string;
  productId: string;
  productName: string;
  sku?: string;
  warehouseId: string;
  warehouseName?: string;
  quantity: number;
  reorderLevel?: number;
};
export type StockMovement = {
  id: string;
  productId: string;
  productName?: string;
  warehouseId?: string;
  type: string;
  quantity: number;
  referenceType?: string;
  referenceId?: string;
  notes?: string;
  createdAt: string;
  createdBy?: string;
};

export const stockApi = {
  warehouses: () => get<ListResponse<Warehouse> | Warehouse[]>("/stock/warehouses"),
  createWarehouse: (body: Record<string, unknown>) => post<Warehouse>("/stock/warehouses", body),
  updateWarehouse: (id: string, body: Record<string, unknown>) => patch<Warehouse>(`/stock/warehouses/${id}`, body),
  deleteWarehouse: (id: string) => del(`/stock/warehouses/${id}`),
  stockIn: (body: Record<string, unknown>) => post("/stock/in", body),
  stockOut: (body: Record<string, unknown>) => post("/stock/out", body),
  transfer: (body: Record<string, unknown>) => post("/stock/transfers", body),
  purchaseUpdate: (body: Record<string, unknown>) => post("/stock/purchase-update", body),
  salesDeduction: (body: Record<string, unknown>) => post("/stock/sales-deduction", body),
  levels: async (params?: PageParams & { warehouseId?: string; lowStock?: boolean }) => {
    const raw = await get<ListResponse<Record<string, any>>>("/stock/levels", params);
    return {
      data: raw.data.map((r): StockLevel => ({
        id: r.id,
        productId: r.productId,
        productName: r.productName ?? r.product?.name ?? "",
        sku: r.sku ?? r.product?.sku,
        warehouseId: r.warehouseId,
        warehouseName: r.warehouseName, // the page fills this from its own warehouse list
        quantity: Number(r.quantity ?? 0),
        reorderLevel: r.reorderLevel ?? r.product?.reorderLevel,
      })),
      meta: raw.meta,
    };
  },
  movements: async (params?: PageParams & { productId?: string; warehouseId?: string; type?: string }) => {
    const raw = await get<ListResponse<Record<string, any>>>("/stock/movements", params);
    return {
      data: raw.data.map((m): StockMovement => ({
        id: m.id,
        productId: m.productId,
        productName: m.productName ?? m.product?.name,
        warehouseId: m.warehouseId,
        type: m.type,
        quantity: Number(m.quantity ?? 0),
        referenceType: m.referenceType,
        referenceId: m.referenceId,
        notes: m.notes,
        createdAt: m.createdAt,
        createdBy: m.createdById ?? m.createdBy,
      })),
      meta: raw.meta,
    };
  },
  lowStockAlerts: async (): Promise<StockLevel[]> =>
    asArray<Record<string, any>>(await get<unknown>("/stock/alerts/low-stock")).map((a) => ({
      id: a.productId,
      productId: a.productId,
      productName: a.name ?? "",
      sku: a.sku,
      warehouseId: "",
      quantity: Number(a.currentStock ?? 0),
      reorderLevel: a.reorderLevel,
    })),
  outOfStockAlerts: async (): Promise<StockLevel[]> =>
    asArray<Record<string, any>>(await get<unknown>("/stock/alerts/out-of-stock")).map((a) => ({
      id: a.productId,
      productId: a.productId,
      productName: a.name ?? "",
      sku: a.sku,
      warehouseId: "",
      quantity: Number(a.currentStock ?? 0),
      reorderLevel: a.reorderLevel,
    })),
  expiryAlerts: async (days = 30) => {
    const raw = await get<ListResponse<Record<string, any>>>("/stock/alerts/expiry", { days });
    return {
      data: raw.data.map((b) => ({
        ...b,
        productName: b.product?.name,
        productId: b.productId ?? b.product?.id,
      })),
      meta: raw.meta,
    };
  },
  recalculate: () => post("/stock/recalculate"),
};

// ---------- Purchases ----------
export type Purchase = {
  id: string;
  purchaseNumber: string;
  supplierId?: string;
  supplierName?: string;
  invoiceDate: string;
  totalAmount: string;
  paidAmount: string;
  status: string;
  items?: PurchaseItem[];
  createdAt: string;
};
export type PurchaseItem = {
  productId: string;
  productName?: string;
  quantity: number;
  unitPrice: string;
  gstRate?: string;
};

const mapPurchase = (raw: Record<string, any>): Purchase => ({
  id: raw.id,
  purchaseNumber: raw.purchaseNumber,
  supplierId: raw.supplierId,
  supplierName: raw.supplier?.name ?? raw.supplierName,
  invoiceDate: raw.invoiceDate ?? raw.purchaseDate,
  totalAmount: String(raw.totalAmount ?? 0),
  paidAmount: String(raw.paidAmount ?? 0),
  status: raw.status,
  items: (raw.items ?? []).map((it: Record<string, any>) => ({
    productId: it.productId,
    productName: it.product?.name ?? it.productName,
    quantity: Number(it.quantity ?? 0),
    unitPrice: String(it.unitCost ?? it.unitPrice ?? 0),
    gstRate: String(it.taxRate ?? it.gstRate ?? 0),
  })),
  createdAt: raw.createdAt,
});

const toPurchasePayload = (body: Record<string, unknown>): Record<string, unknown> => {
  const items = ((body.items as Record<string, unknown>[]) ?? []).map((it) => ({
    productId: it.productId,
    quantity: Number(it.quantity ?? 0),
    unitCost: String(it.unitCost ?? it.unitPrice ?? 0),
    ...(it.taxRate ?? it.gstRate ? { taxRate: String(it.taxRate ?? it.gstRate) } : {}),
  }));
  const payload: Record<string, unknown> = { items };
  if (body.purchaseDate ?? body.invoiceDate) payload.purchaseDate = body.purchaseDate ?? body.invoiceDate;
  if (body.purchaseNumber) payload.purchaseNumber = body.purchaseNumber;
  if (body.supplierId) payload.supplierId = body.supplierId;
  if (body.warehouseId) payload.warehouseId = body.warehouseId;
  if (body.notes) payload.notes = body.notes;
  return payload;
};

export const purchasesApi = {
  list: async (params?: PageParams) => {
    const raw = await get<ListResponse<Record<string, any>>>("/purchases", params);
    return { data: raw.data.map(mapPurchase), meta: raw.meta };
  },
  get: async (id: string) => mapPurchase(await get<Record<string, any>>(`/purchases/${id}`)),
  create: async (body: Record<string, unknown>) =>
    mapPurchase(await post<Record<string, any>>("/purchases", toPurchasePayload(body))),
  update: async (id: string, body: Record<string, unknown>) =>
    mapPurchase(await patch<Record<string, any>>(`/purchases/${id}`, toPurchasePayload(body))),
};

// ---------- Billing ----------
export type InvoiceItem = {
  id?: string;
  productId?: string;
  description: string;
  quantity: number;
  unitPrice: string;
  discountRate?: string;
  gstRate?: string;
};
export type Invoice = {
  id: string;
  invoiceNumber: string;
  customerId?: string;
  customerName?: string;
  invoiceDate: string;
  dueDate?: string;
  status: string;
  subtotal: string;
  discountTotal: string;
  gstTotal: string;
  grandTotal: string;
  paidAmount: string;
  balanceAmount: string;
  items: InvoiceItem[];
  createdAt: string;
};
export type Payment = {
  id: string;
  invoiceId?: string;
  customerId?: string;
  amount: string;
  mode: string;
  direction: string;
  referenceNumber?: string;
  paymentDate: string;
  notes?: string;
  createdAt: string;
};

const mapInvoice = (raw: Record<string, any>): Invoice => {
  const total = num(raw.totalAmount ?? raw.grandTotal);
  const paid = num(raw.paidAmount);
  return {
    id: raw.id,
    invoiceNumber: raw.invoiceNumber,
    customerId: raw.customerId,
    customerName: raw.customerName ?? raw.customer?.name ?? undefined,
    invoiceDate: raw.invoiceDate ?? raw.issueDate,
    dueDate: raw.dueDate,
    status: raw.status,
    subtotal: String(raw.subtotal ?? 0),
    discountTotal: String(raw.discountTotal ?? 0),
    gstTotal: String(raw.taxTotal ?? raw.gstTotal ?? 0),
    grandTotal: String(total),
    paidAmount: String(paid),
    balanceAmount: String(total - paid),
    items: (raw.items ?? []).map((it: Record<string, any>) => ({
      id: it.id,
      productId: it.productId,
      description: it.description ?? it.productName ?? "",
      quantity: Number(it.quantity ?? 0),
      unitPrice: String(it.unitPrice ?? it.rate ?? 0),
      discountRate: String(it.discountRate ?? it.discountPercent ?? 0),
      gstRate: String(it.gstRate ?? it.taxRate ?? 0),
    })),
    createdAt: raw.createdAt,
  };
};

export const billingApi = {
  invoices: async (params?: PageParams & { status?: string; customerId?: string }) => {
    const raw = await get<ListResponse<Record<string, any>>>("/billing/invoices", params);
    return { data: raw.data.map(mapInvoice), meta: raw.meta };
  },
  getInvoice: async (id: string) => mapInvoice(await get<Record<string, any>>(`/billing/invoices/${id}`)),
  createInvoice: (body: Record<string, unknown>) => post<Invoice>("/billing/invoices", body),
  updateInvoice: (id: string, body: Record<string, unknown>) => patch<Invoice>(`/billing/invoices/${id}`, body),
  pdf: (id: string) => post<{ url?: string; pdfBase64?: string }>(`/billing/invoices/${id}/pdf`),
  download: (id: string) => get<{ url: string }>(`/billing/invoices/${id}/download`),
  share: async (id: string) => {
    const raw = await post<{ shareUrl?: string; url?: string; token: string }>(`/billing/invoices/${id}/share`, {});
    return { shareUrl: raw.shareUrl ?? raw.url ?? "", token: raw.token };
  },
  smsLink: (id: string, body: { phone: string }) => post(`/billing/invoices/${id}/sms-link`, body),
  whatsappLink: async (id: string, body: { phone: string }) => {
    const raw = await post<{ whatsappUrl?: string; url?: string; shareUrl?: string }>(`/billing/invoices/${id}/whatsapp-link`, body);
    return { whatsappUrl: raw.whatsappUrl ?? raw.url ?? "" };
  },
  recordPayment: (body: Record<string, unknown>) => post<Payment>("/billing/payments", body),
  payments: (params?: PageParams) => get<ListResponse<Payment>>("/billing/payments", params),
};

// ---------- Customers ----------
export type Customer = {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  gstNumber?: string;
  creditLimit?: string;
  balance: string;
  totalPurchases: string;
  createdAt: string;
};
export type LedgerEntry = {
  id: string;
  date: string;
  type: string;
  reference: string;
  debit: string;
  credit: string;
  runningBalance: string;
};

const mapCustomer = (raw: Record<string, any>): Customer => ({
  id: raw.id,
  name: raw.name,
  phone: raw.phone,
  email: raw.email,
  address: raw.address,
  gstNumber: raw.gstNumber,
  creditLimit: String(raw.creditLimit ?? 0),
  balance: String(raw.balance ?? raw.outstandingBalance ?? 0),
  totalPurchases: String(raw.totalPurchases ?? 0),
  createdAt: raw.createdAt,
});

export const customersApi = {
  list: async (params?: PageParams) => {
    const raw = await get<ListResponse<Record<string, any>>>("/customers", params);
    return { data: raw.data.map(mapCustomer), meta: raw.meta };
  },
  get: async (id: string) => mapCustomer(await get<Record<string, any>>(`/customers/${id}`)),
  create: (body: Record<string, unknown>) => post<Customer>("/customers", body),
  update: (id: string, body: Record<string, unknown>) => patch<Customer>(`/customers/${id}`, body),
  remove: (id: string) => del(`/customers/${id}`),
  // Backend returns one row per unpaid invoice; the page wants one row per customer.
  duePayments: async (params?: PageParams) => {
    const raw = await get<ListResponse<Record<string, any>>>("/customers/due-payments", params);
    const byCustomer = new Map<string, { id: string; name: string; phone?: string; dueAmount: number }>();
    for (const inv of raw.data) {
      const cust = (inv.customer ?? {}) as Record<string, any>;
      const key = cust.id ?? inv.customerId;
      if (!key) continue;
      const cur = byCustomer.get(key) ?? { id: key, name: cust.name ?? "Customer", phone: cust.phone, dueAmount: 0 };
      cur.dueAmount += num(inv.dueAmount);
      byCustomer.set(key, cur);
    }
    const data = [...byCustomer.values()].map((c) => ({ ...c, dueAmount: String(c.dueAmount) }));
    return { data, meta: { ...raw.meta, total: data.length } };
  },
  history: async (id: string) => {
    const raw = await get<{ data: Record<string, any>[] } | Record<string, any>[]>(`/customers/${id}/history`);
    return asArray<Record<string, any>>(raw);
  },
  purchases: async (id: string, params?: PageParams) => {
    const raw = await get<ListResponse<Record<string, any>>>(`/customers/${id}/purchases`, params);
    return { data: raw.data.map(mapInvoice), meta: raw.meta };
  },
  ledger: async (id: string, params?: { fromDate?: string; toDate?: string }): Promise<LedgerEntry[]> => {
    const raw = await get<{ ledger?: Record<string, any>[] } | Record<string, any>[]>(`/customers/${id}/ledger`, params);
    const rows = Array.isArray(raw) ? raw : raw.ledger ?? [];
    return rows.map((e) => ({
      id: `${e.date ?? ""}-${e.reference ?? ""}-${e.referenceId ?? ""}`,
      date: e.date,
      type: e.type,
      reference: e.reference,
      debit: String(e.debit ?? 0),
      credit: String(e.credit ?? 0),
      runningBalance: String(e.balance ?? 0),
    }));
  },
  sendSmsReminder: (id: string, body?: Record<string, unknown>) => post(`/customers/${id}/reminders/sms`, body ?? {}),
  sendWhatsappReminder: (id: string, body?: Record<string, unknown>) => post(`/customers/${id}/reminders/whatsapp`, body ?? {}),
  reminders: (id: string) => get<unknown[]>(`/customers/${id}/reminders`),
};

// ---------- Finance ----------
export type FinanceCategory = { id: string; name: string; type: string; description?: string };
export type FinanceEntry = {
  id: string;
  categoryId?: string;
  categoryName?: string;
  amount: string;
  description?: string;
  date: string;
  paymentMode?: string;
  createdAt: string;
};

type EntryKind = "revenues" | "expenses" | "assets" | "liabilities";

const mapFinanceEntry = (raw: Record<string, any>, kind: EntryKind): FinanceEntry => ({
  id: raw.id,
  categoryId: raw.categoryId,
  categoryName: raw.category?.name ?? raw.categoryName,
  amount: String(
    kind === "assets"
      ? raw.currentValue ?? raw.purchaseValue ?? 0
      : kind === "liabilities"
        ? raw.outstandingAmount ?? raw.totalAmount ?? 0
        : raw.amount ?? 0,
  ),
  description: raw.description ?? raw.title ?? raw.name,
  date: raw.date ?? raw.revenueDate ?? raw.expenseDate ?? raw.purchaseDate ?? raw.dueDate ?? raw.createdAt,
  paymentMode: raw.paymentMode,
  createdAt: raw.createdAt,
});

/** The editor form posts generic {description, amount, categoryId, date, paymentMode}; map to each kind's backend schema. */
const toFinancePayload = (kind: EntryKind, body: Record<string, unknown>): Record<string, unknown> => {
  const date = body.date as string | undefined;
  if (kind === "revenues") {
    return {
      title: body.description ?? body.title,
      amount: String(body.amount ?? 0),
      ...(body.categoryId ? { categoryId: body.categoryId } : {}),
      ...(date ? { revenueDate: date } : {}),
      ...(body.source ? { source: body.source } : {}),
      ...(body.notes ? { notes: body.notes } : {}),
    };
  }
  if (kind === "expenses") {
    return {
      title: body.description ?? body.title,
      amount: String(body.amount ?? 0),
      ...(body.categoryId ? { categoryId: body.categoryId } : {}),
      ...(date ? { expenseDate: date } : {}),
      ...(body.paymentMode ? { paymentMode: body.paymentMode } : {}),
      ...(body.notes ? { notes: body.notes } : {}),
    };
  }
  if (kind === "assets") {
    return {
      name: body.description ?? body.name,
      purchaseValue: String(body.amount ?? body.purchaseValue ?? 0),
      currentValue: String(body.amount ?? body.currentValue ?? body.purchaseValue ?? 0),
      ...(date ? { purchaseDate: date } : {}),
      ...(body.notes ? { notes: body.notes } : {}),
    };
  }
  return {
    name: body.description ?? body.name,
    totalAmount: String(body.amount ?? body.totalAmount ?? 0),
    outstandingAmount: String(body.amount ?? body.outstandingAmount ?? body.totalAmount ?? 0),
    ...(date ? { dueDate: date } : {}),
    ...(body.notes ? { notes: body.notes } : {}),
  };
};

const financeEntries = (kind: EntryKind) => ({
  list: async (params?: PageParams) => {
    const raw = await get<ListResponse<Record<string, any>>>(`/finance/${kind}`, params);
    return { data: raw.data.map((r) => mapFinanceEntry(r, kind)), meta: raw.meta };
  },
  create: async (body: Record<string, unknown>) =>
    mapFinanceEntry(await post<Record<string, any>>(`/finance/${kind}`, toFinancePayload(kind, body)), kind),
  update: async (id: string, body: Record<string, unknown>) =>
    mapFinanceEntry(await patch<Record<string, any>>(`/finance/${kind}/${id}`, toFinancePayload(kind, body)), kind),
  remove: (id: string) => del(`/finance/${kind}/${id}`),
});

export const financeApi = {
  categories: (params?: PageParams & { type?: string }) =>
    get<ListResponse<FinanceCategory> | FinanceCategory[]>("/finance/categories", params),
  createCategory: (body: Record<string, unknown>) => post<FinanceCategory>("/finance/categories", body),
  revenues: (params?: PageParams) => financeEntries("revenues").list(params),
  createRevenue: (body: Record<string, unknown>) => financeEntries("revenues").create(body),
  updateRevenue: (id: string, body: Record<string, unknown>) => financeEntries("revenues").update(id, body),
  deleteRevenue: (id: string) => financeEntries("revenues").remove(id),
  expenses: (params?: PageParams) => financeEntries("expenses").list(params),
  createExpense: (body: Record<string, unknown>) => financeEntries("expenses").create(body),
  updateExpense: (id: string, body: Record<string, unknown>) => financeEntries("expenses").update(id, body),
  deleteExpense: (id: string) => financeEntries("expenses").remove(id),
  assets: (params?: PageParams) => financeEntries("assets").list(params),
  createAsset: (body: Record<string, unknown>) => financeEntries("assets").create(body),
  updateAsset: (id: string, body: Record<string, unknown>) => financeEntries("assets").update(id, body),
  deleteAsset: (id: string) => financeEntries("assets").remove(id),
  liabilities: (params?: PageParams) => financeEntries("liabilities").list(params),
  createLiability: (body: Record<string, unknown>) => financeEntries("liabilities").create(body),
  updateLiability: (id: string, body: Record<string, unknown>) => financeEntries("liabilities").update(id, body),
  deleteLiability: (id: string) => financeEntries("liabilities").remove(id),
  dashboard: async () => {
    const raw = await get<Record<string, any>>("/finance/dashboard");
    return { ...raw, netProfit: raw.grossProfit, cashBalance: raw.netCashFlow };
  },
  cashFlow: async (params?: { from?: string; to?: string }) => {
    const raw = await get<{ series?: Record<string, any>[] } | Record<string, any>[]>("/finance/cash-flow", dateRangeParams(params));
    const series = Array.isArray(raw) ? raw : raw.series ?? [];
    return series.map((s) => ({ date: s.date, inflow: s.cashIn ?? s.inflow, outflow: s.cashOut ?? s.outflow, net: s.net }));
  },
  profitLoss: async (params?: { from?: string; to?: string }) => {
    const raw = await get<Record<string, any>>("/finance/profit-loss", dateRangeParams(params));
    return {
      totalRevenue: raw.revenue?.totalRevenue ?? raw.totalRevenue,
      totalExpenses: raw.expenses?.totalExpenses ?? raw.totalExpenses,
      netProfit: raw.netProfit,
      gstCollected: raw.gstCollected,
      gstPaid: raw.gstPaid,
      taxPayable: raw.taxPayable,
    };
  },
  revenueAnalysis: async (params?: { from?: string; to?: string }) =>
    asArray(await get<unknown>("/finance/revenue-analysis", dateRangeParams(params))),
  monthlyReport: (year: number, month: number) => get<Record<string, unknown>>("/finance/reports/monthly", { year, month }),
  yearlyReport: (year: number) => get<Record<string, unknown>>("/finance/reports/yearly", { year }),
  taxReport: async (params?: { from?: string; to?: string }) => {
    const raw = await get<Record<string, any>>("/finance/reports/tax", dateRangeParams(params));
    return {
      totalRevenue: raw.taxableRevenue,
      gstCollected: raw.outputTax?.total,
      gstPaid: raw.inputTaxCredit,
      taxPayable: raw.netTaxPayable,
    };
  },
};

// ---------- Analytics ----------
const mapSeries = (series: unknown[], xKey: string) =>
  (Array.isArray(series) ? series : []).map((p) => {
    const r = p as Record<string, unknown>;
    return { [xKey]: r.period ?? r.date ?? r.week ?? r.month, sales: num(r.sales), orders: r.orders ?? 0 };
  });

export const analyticsApi = {
  dashboard: async () => {
    const raw = (await get<Record<string, unknown>>("/analytics/dashboard")) as Record<string, any>;
    const s = raw.summary ?? {};
    const series = raw.salesChart?.series ?? [];
    const last = series[series.length - 1] ?? {};
    const [inv, cust, pay] = await Promise.all([
      get<Record<string, any>>("/analytics/inventory-insights").catch(() => ({})),
      get<Record<string, any>>("/analytics/customer-insights").catch(() => ({})),
      get<Record<string, any>>("/analytics/payment-analysis").catch(() => ({})),
    ]);
    return {
      todaySales: num(last.sales),
      monthRevenue: num(s.totalSales),
      revenueGrowthPercent: num(s.growthPercent),
      profitMarginPercent: 0,
      inventoryValue: num((inv as any).totalValue),
      outstandingPayments: num((pay as any).outstanding?.amount),
      totalProducts: (inv as any).totalProducts ?? 0,
      totalCustomers: (cust as any).totalCustomers ?? 0,
      invoiceCount: s.invoiceCount ?? 0,
      averageOrderValue: num(s.averageOrderValue),
    };
  },
  salesDaily: async (params?: { days?: number }) => {
    const raw = (await get<Record<string, any>>("/analytics/sales-chart", { ...(params ?? {}), groupBy: "day" })) as Record<string, any>;
    return mapSeries(raw.series, "date");
  },
  salesWeekly: async (params?: { weeks?: number }) => {
    const raw = (await get<Record<string, any>>("/analytics/sales-chart", { ...(params ?? {}), groupBy: "week" })) as Record<string, any>;
    return mapSeries(raw.series, "week");
  },
  salesMonthly: async (params?: { months?: number }) => {
    const raw = (await get<Record<string, any>>("/analytics/sales-chart", { ...(params ?? {}), groupBy: "month" })) as Record<string, any>;
    return mapSeries(raw.series, "month");
  },
  topProducts: async (params?: { limit?: number }) => {
    const raw = await get<unknown>("/analytics/top-products", params);
    const list = (Array.isArray(raw) ? raw : (raw as any)?.data ?? []) as Record<string, any>[];
    return list.map((p) => ({ ...p, productName: p.description ?? p.name ?? p.productName, revenue: num(p.revenue) }));
  },
  topCustomers: async (params?: { limit?: number }) => {
    const raw = (await get<Record<string, any>>("/analytics/customer-insights", params)) as Record<string, any>;
    const list = (raw.topCustomers ?? []) as Record<string, any>[];
    return list.map((c) => ({ ...c, customerName: c.name ?? c.customerName, totalSpent: num(c.totalSpent) }));
  },
  revenueGrowth: () => get<unknown[]>("/analytics/revenue-growth"),
  profitMargin: () => get<unknown[]>("/analytics/profit-margin"),
  inventoryValue: () => get<{ totalValue: string } | unknown>("/analytics/inventory-value"),
  outstandingPayments: () => get<{ total: string } | unknown>("/analytics/outstanding-payments"),
  assets: () => get<unknown>("/analytics/assets"),
  liabilities: () => get<unknown>("/analytics/liabilities"),
};

// ---------- Subscriptions ----------
export type Plan = {
  id: string;
  code: string;
  name: string;
  price: string;
  billingCycle: string;
  features: string[];
  limits: Record<string, number>;
};
export type Subscription = {
  id: string;
  planId: string;
  planName: string;
  planCode?: string;
  status: string;
  startDate: string;
  endDate?: string;
  trialEndsAt?: string;
  shopName?: string;
};

const mapPlan = (raw: Record<string, any>): Plan => ({
  id: raw.id,
  code: raw.code,
  name: raw.name,
  price: String(raw.price ?? raw.monthlyPrice ?? 0),
  billingCycle: raw.billingCycle ?? "MONTHLY",
  features: raw.features ?? [],
  limits: raw.limits ?? {},
});

const mapSubscription = (raw: Record<string, any>): Subscription => ({
  id: raw.id,
  planId: raw.planId,
  planName: raw.plan?.name ?? raw.planName ?? raw.planCode ?? "",
  planCode: raw.plan?.code ?? raw.planCode,
  status: raw.status,
  startDate: raw.startDate,
  endDate: raw.endDate,
  trialEndsAt: raw.trialEndsAt,
  shopName: raw.shopName,
});

export const subscriptionsApi = {
  plans: async (): Promise<Plan[]> => asArray<Record<string, any>>(await get<unknown>("/subscriptions/plans")).map(mapPlan),
  current: async (): Promise<Subscription> => mapSubscription(await get<Record<string, any>>("/subscriptions/current")),
  history: async (params?: PageParams) => {
    const raw = await get<ListResponse<Record<string, any>>>("/subscriptions/history", params);
    return { data: raw.data.map(mapSubscription), meta: raw.meta };
  },
  limits: async (): Promise<Record<string, { used: number; limit: number; remaining: number }>> => {
    const raw = await get<{ usage?: Record<string, { used: number; limit: number; remaining: number }> }>("/subscriptions/limits");
    return raw.usage ?? {};
  },
  change: (body: { planCode: string; billingCycle?: string; startTrial?: boolean }) =>
    post<Subscription>("/subscriptions/change", body),
  cancel: () => post<Subscription>("/subscriptions/cancel"),
  adminAssign: (shopId: string, body: { planCode: string; billingCycle?: string; status?: string; trialDays?: number }) =>
    post("/subscriptions/admin/assign", { shopId, ...body }),
};

// ---------- Audit ----------
export type AuditLog = {
  id: string;
  actorId?: string;
  actorName?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  shopId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
};

export const auditApi = {
  list: (params?: PageParams & { action?: string; entityType?: string; shopId?: string; from?: string; to?: string }) =>
    get<ListResponse<AuditLog>>("/audit", dateRangeParams(params)),
  dashboard: () => get<Record<string, unknown>>("/audit/dashboard"),
};

// ---------- Notifications ----------
export type Notification = {
  id: string;
  title: string;
  body?: string;
  category: string;
  channel?: string;
  status: string;
  createdAt: string;
};

export const notificationsApi = {
  list: async (params?: PageParams) => {
    const raw = await get<ListResponse<Record<string, any>>>("/notifications", params);
    return {
      data: raw.data.map((n): Notification => ({
        id: n.id,
        title: n.title,
        body: n.body,
        category: n.category ?? n.type ?? "",
        channel: n.channel ?? n.data?.channel,
        status: n.status ?? (n.sentAt ? "SENT" : "PENDING"),
        createdAt: n.createdAt,
      })),
      meta: raw.meta,
    };
  },
  markRead: (id: string) => patch(`/notifications/${id}/read`),
  retry: (id: string) => post(`/notifications/${id}/retry`),
};

// ---------- Admin ----------
export type AdminDashboardSummary = {
  shops: { total: number; active: number; inactive: number; blocked: number; newToday: number; newThisMonth: number };
  revenue: { daily: string; weekly: string; monthly: string; yearly: string };
  users: { total: number; active: number; suspended: number };
  subscriptions: { free: number; starter: number; professional: number; enterprise: number };
  finance: { totalPlatformRevenue: string; pendingPayments: string; subscriptionRenewals: number };
};

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  status: string;
  lastLoginAt?: string;
  createdAt: string;
};

export type Approval = {
  id: string;
  type: string;
  status: string;
  shopId?: string;
  shopName?: string;
  requestedBy?: string;
  oldValue?: Record<string, unknown>;
  requestedValue: Record<string, unknown>;
  reason?: string;
  reviewerComment?: string;
  createdAt: string;
};

export type Ticket = {
  id: string;
  ticketNo: string;
  shopId?: string;
  shopName?: string;
  subject: string;
  description: string;
  priority: string;
  status: string;
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
};

export type ReferralCode = {
  id: string;
  code: string;
  status: string;
  createdAt: string;
};

export const adminApi = {
  dashboard: () => get<AdminDashboardSummary>("/admin/dashboard"),
  shops: (params?: PageParams & { status?: string }) => get<ListResponse<Shop>>("/admin/shops", params),
  getShop: (id: string) => get<Shop & Record<string, unknown>>(`/admin/shops/${id}`),
  // Backend creates a shop owner + shop + membership in one call.
  // Returns credentialsEmailed=true when the welcome email was sent.
  createShop: (body: {
    name: string;
    ownerName: string;
    email?: string;
    phone: string;
    password: string;
    shopType?: string;
    gstNumber?: string;
    shopPhone?: string;
    shopAddress?: string;
    city?: string;
    state?: string;
    pincode?: string;
    referralCode?: string;
    [k: string]: unknown;
  }) =>
    post<{ credentialsEmailed?: boolean }>("/admin/shop-owners", {
      shopName: body.name,
      fullName: body.ownerName,
      email: body.email || undefined,
      phone: body.phone,
      password: body.password,
      shopType: body.shopType || undefined,
      gstNumber: body.gstNumber || undefined,
      shopPhone: body.shopPhone || undefined,
      shopAddress: body.shopAddress || undefined,
      city: body.city || undefined,
      state: body.state || undefined,
      pincode: body.pincode || undefined,
      referralCode: body.referralCode || undefined,
    }),
  updateShop: (id: string, body: Record<string, unknown>) => patch<Shop>(`/admin/shops/${id}`, body),
  suspendShop: (id: string, reason?: string) => post(`/admin/shops/${id}/suspend`, { reason }),
  activateShop: (id: string) => post(`/admin/shops/${id}/reactivate`),
  deleteShop: (id: string) => del(`/admin/shops/${id}`),
  users: async (params?: PageParams & { status?: string }) => {
    const raw = await get<ListResponse<Record<string, any>>>("/admin/users", params);
    return {
      data: raw.data.map(
        (u): AdminUser => ({
          id: u.id,
          name: u.fullName ?? u.name ?? "",
          email: u.email ?? "",
          phone: u.phone,
          status: u.status,
          lastLoginAt: u.lastLoginAt,
          createdAt: u.createdAt,
        }),
      ),
      meta: raw.meta,
    };
  },
  updateUser: (id: string, body: Record<string, unknown>) => patch<AdminUser>(`/admin/users/${id}`, body),
  // The admin sets the new password; the backend returns { id, email, passwordReset }.
  resetUserPassword: (id: string, password: string) =>
    post<{ id: string; email: string; passwordReset: boolean }>(`/admin/users/${id}/reset-password`, { password }),
  subscriptions: async (params?: PageParams & { status?: string }) => {
    const raw = await get<ListResponse<Record<string, any>>>("/admin/subscriptions", params);
    return { data: raw.data.map(mapSubscription), meta: raw.meta };
  },
  assignSubscription: (shopId: string, body: { planCode: string; billingCycle?: string; status?: string; trialDays?: number }) =>
    post("/subscriptions/admin/assign", { shopId, ...body }),
  financeSummary: () => get<Record<string, unknown>>("/admin/finance/summary"),
  revenueReport: (params?: { from?: string; to?: string }) =>
    get<{ byPlan?: { planCode: string; count: number; mrr: string }[]; mrr?: string; newSubscriptions?: number }>(
      "/admin/reports/revenue",
      dateRangeParams(params),
    ),
  approvals: async (params?: PageParams & { status?: string }) => {
    // Backend has no MODIFICATION_REQUESTED status; treat it as "all".
    const q = { ...params };
    if (q.status === "MODIFICATION_REQUESTED") delete q.status;
    const raw = await get<ListResponse<Record<string, any>>>("/admin/approvals", q);
    return {
      data: raw.data.map(
        (r): Approval => ({
          id: r.id,
          type: r.type ?? r.entityType ?? "",
          status: r.status,
          shopId: r.shopId,
          shopName: r.shopName ?? r.shop?.name,
          requestedBy: r.requesterName ?? r.requesterEmail,
          oldValue: r.oldValue,
          requestedValue: r.requestedValue ?? r.changes ?? {},
          reason: r.reason,
          reviewerComment: r.reviewNote ?? r.reviewerComment,
          createdAt: r.createdAt,
        }),
      ),
      meta: raw.meta,
    };
  },
  approveApproval: (id: string) => post(`/admin/approvals/${id}/approve`, {}),
  rejectApproval: (id: string, reason?: string) => post(`/admin/approvals/${id}/reject`, { reason }),
  requestModification: (id: string, comment?: string) => post(`/admin/approvals/${id}/request-modification`, { comment }),
  tickets: async (params?: PageParams & { status?: string; priority?: string }) => {
    const raw = await get<ListResponse<Record<string, any>>>("/admin/tickets", params);
    return {
      data: raw.data.map(
        (t): Ticket => ({
          id: t.id,
          ticketNo: t.ticketNo ?? `#${String(t.id).slice(0, 8).toUpperCase()}`,
          shopId: t.shopId,
          shopName: t.shopName ?? t.shop?.name,
          subject: t.subject,
          description: t.description,
          priority: t.priority,
          status: t.status,
          assignedTo: t.assignee?.fullName ?? t.assignedTo,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        }),
      ),
      meta: raw.meta,
    };
  },
  getTicket: (id: string) => get<Ticket>(`/admin/tickets/${id}`),
  createTicket: (body: { shopId?: string; subject: string; description: string; category?: string; priority?: string }) =>
    post<Ticket>("/admin/tickets", body),
  updateTicket: (id: string, body: { status?: string; priority?: string; assignedToAdminId?: string | null }) =>
    patch<Ticket>(`/admin/tickets/${id}`, body),
  resolveTicket: (id: string) => patch<Ticket>(`/admin/tickets/${id}`, { status: "RESOLVED" }),
  closeTicket: (id: string) => patch<Ticket>(`/admin/tickets/${id}`, { status: "CLOSED" }),
  replyTicket: (id: string, body: { message: string }) => post(`/admin/tickets/${id}/replies`, body),
  auditLogs: (params?: PageParams & { action?: string; entityType?: string; from?: string; to?: string }) =>
    get<ListResponse<AuditLog>>("/admin/audit-logs", dateRangeParams(params)),
  settings: () => get<Record<string, unknown>>("/admin/settings"),
  updateSettings: (body: Record<string, unknown>) => put("/admin/settings", body),
  loginHistory: async (params?: PageParams & { accountId?: string; from?: string; to?: string }) => {
    const raw = await get<ListResponse<Record<string, any>>>("/admin/login-history", dateRangeParams(params));
    return {
      data: raw.data.map((r) => ({
        ...r,
        email: r.actor?.email ?? null,
        fullName: r.actor?.fullName ?? null,
        accountId: r.actorId,
        success: r.action === "LOGIN_SUCCESS",
      })),
      meta: raw.meta,
    };
  },
  securityDevices: async (params?: PageParams & { search?: string }) => {
    const raw = await get<ListResponse<Record<string, any>>>("/admin/devices", params);
    return { data: raw.data.map(mapDevice), meta: raw.meta };
  },
  referralStats: () => get<Record<string, unknown>>("/admin/referrals/stats"),
  referralCodes: (params?: PageParams) => get<ListResponse<ReferralCode>>("/admin/referrals/codes", params),
  referrals: (params?: PageParams) => get<ListResponse<Record<string, unknown>>>("/admin/referrals", params),

  // Admin-side 2FA status (auth module, mirrored here for the security page)
  twoFactorStatus: () => get<{ enabled: boolean; methods: string[] }>("/auth/2fa/status"),
};

// ---------- HR: Attendance & Salary ----------
export type AttendanceStatus = "PRESENT" | "ABSENT" | "HALF_DAY" | "PAID_LEAVE" | "WEEKLY_OFF";

export type HrMember = {
  membershipId: string;
  accountId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  role: string;
};

export type AttendanceDayRecord = {
  id: string;
  date: string;
  status: AttendanceStatus;
  notes?: string | null;
};

export type AttendanceDay = {
  member: HrMember;
  records: AttendanceDayRecord[];
};

export type SalaryStructure = {
  id: string;
  membershipId: string;
  monthlySalary: string;
  effectiveFrom: string;
};

export type SalaryAdvance = {
  id: string;
  membershipId: string;
  amount: string;
  advanceDate: string;
  notes?: string | null;
};

export type SalarySlipPayment = {
  id: string;
  status: string;
  paidAmount: string;
  paidAt: string | null;
  mode: string | null;
};

export type SalarySlip = {
  member: HrMember;
  year: number;
  month: number;
  monthlySalary: string;
  totalDays: number;
  presentDays: number;
  absentDays: number;
  halfDays: number;
  leaveDays: number;
  unmarkedDays: number;
  grossPayable: string;
  advances: string;
  bonus: string;
  deductions: string;
  netPayable: string;
  payment: SalarySlipPayment | null;
};

export type SalaryPaymentRecord = {
  id: string;
  membershipId: string;
  memberName: string;
  year: number;
  month: number;
  monthlySalary: string;
  grossPayable: string;
  advances: string;
  bonus: string;
  deductions: string;
  netPayable: string;
  paidAmount: string;
  status: string;
  mode: string | null;
  notes: string | null;
  paidAt: string | null;
};

export const hrApi = {
  attendance: (params?: { date?: string; from?: string; to?: string; membershipId?: string }) =>
    get<{ data: AttendanceDay[] }>("/hr/attendance", params),
  markAttendance: (body: { date: string; records: { membershipId: string; status: AttendanceStatus; notes?: string }[] }) =>
    post<{ data: { date: string; marked: number } }>("/hr/attendance", body),
  salaryStructures: () => get<{ data: SalaryStructure[] }>("/hr/salary-structure"),
  setSalaryStructure: (membershipId: string, body: { monthlySalary: string; effectiveFrom?: string }) =>
    put<{ data: SalaryStructure }>(`/hr/salary-structure/${membershipId}`, body),
  advances: (params?: { membershipId?: string; month?: number; year?: number }) =>
    get<{ data: SalaryAdvance[] }>("/hr/advances", params),
  recordAdvance: (body: { membershipId: string; amount: string; advanceDate?: string; notes?: string }) =>
    post<{ data: SalaryAdvance }>("/hr/advances", body),
  salarySlips: (params: { month: number; year: number }) =>
    get<{ data: SalarySlip[] }>("/hr/salary", params),
  salaryPayments: (params?: { month?: number; year?: number }) =>
    get<{ data: SalaryPaymentRecord[] }>("/hr/salary/payments", params),
  paySalary: (body: { membershipId: string; month: number; year: number; bonus?: string; deductions?: string; mode?: string; notes?: string }) =>
    post<{ data: { id: string; memberName: string; year: number; month: number; netPayable: string; status: string; carriedForward: string } }>("/hr/salary/pay", body),
  loginSessions: (params?: { month?: number; year?: number }) =>
    get<{ data: { id: string; accountId: string; loginAt: string; ipAddress?: string }[] }>("/hr/login-sessions", params),
};

export interface ExpenseRecord {
  id: string;
  category: "RENT" | "SALARY" | "UTILITIES" | "SUPPLIES" | "OTHER";
  categoryName: string;
  title: string;
  amount: string;
  expenseDate: string;
  paymentMode: string | null;
  paidBy: string | null;
  notes: string | null;
  createdAt: string;
}

export interface ExpenseSummary {
  year: number;
  month: number;
  breakdown: { category: string; categoryName: string; total: string; count: number }[];
  grandTotal: string;
  expenseCount: number;
}

export const expensesApi = {
  list: (params?: { page?: number; limit?: number; category?: string; search?: string; fromDate?: string; toDate?: string }) =>
    get<ListResponse<ExpenseRecord>>("/expenses", params),
  create: (body: { category: string; title: string; amount: string; expenseDate: string; paidBy?: string; paymentMode?: string; notes?: string }) =>
    post<ExpenseRecord>("/expenses", body),
  update: (id: string, body: { category?: string; title?: string; amount?: string; expenseDate?: string; paidBy?: string; paymentMode?: string; notes?: string }) =>
    patch<ExpenseRecord>(`/expenses/${id}`, body),
  remove: (id: string) => del<{ deleted: boolean }>(`/expenses/${id}`),
  summary: (params: { year: number; month: number }) =>
    get<ExpenseSummary>("/expenses/summary", params),
  categories: () => get<{ data: { value: string; label: string }[] }>("/expenses/categories"),
};

export type DailyClosing = {
  date: string;
  sales: {
    totalSales: string;
    invoiceCount: number;
    byStatus: { status: string; count: number; amount: string }[];
    averageOrderValue: string;
  };
  collections: {
    totalCollected: string;
    byMode: { mode: string; count: number; amount: string }[];
  };
  credit: { newDue: string; dueInvoiceCount: number };
  expenses: { totalExpenses: string; count: number };
  salary: { salaryPaid: string; count: number };
  cash: { netCash: string; note: string };
  topProducts: { productId: string | null; description: string; quantity: string; revenue: string }[];
  invoices: {
    id: string;
    invoiceNumber: string;
    customerName: string | null;
    status: string;
    totalAmount: string;
    paidAmount: string;
    balanceAmount: string;
    issueDate: string;
  }[];
};

export const reportsApi = {
  dailyClosing: (params?: { date?: string }) => get<DailyClosing>("/reports/daily-closing", params),
};
