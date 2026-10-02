import {
  LayoutDashboard,
  Package,
  Boxes,
  ShoppingCart,
  Receipt,
  Users,
  Wallet,
  UserCog,
  CalendarCheck,
  IndianRupee,
  Crown,
  Settings,
  ClipboardList,
  TrendingDown,
} from "lucide-react";
import type { NavItem } from "@/components/app-shell";

export type PermNavItem = NavItem & { permission?: string | string[] };

export const SHOP_NAV: PermNavItem[] = [
  { href: "/shop/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "ANALYTICS_VIEW" },
  { href: "/shop/billing", label: "Billing", icon: Receipt, permission: "INVOICE_VIEW" },
  { href: "/shop/inventory", label: "Inventory", icon: Package, permission: "INVENTORY_VIEW" },
  { href: "/shop/stock", label: "Stock", icon: Boxes, permission: "STOCK_VIEW" },
  { href: "/shop/purchases", label: "Purchases", icon: ShoppingCart, permission: "STOCK_VIEW" },
  { href: "/shop/customers", label: "Customers", icon: Users, permission: "CUSTOMER_VIEW" },
  { href: "/shop/finance", label: "Finance", icon: Wallet, permission: "FINANCE_VIEW" },
  { href: "/shop/expenses", label: "Expenses", icon: TrendingDown, permission: "FINANCE_VIEW" },
  { href: "/shop/attendance", label: "Attendance", icon: CalendarCheck, permission: "ATTENDANCE_VIEW" },
  { href: "/shop/salary", label: "Salary", icon: IndianRupee, permission: "SALARY_VIEW" },
  { href: "/shop/reports/daily-closing", label: "Daily Closing", icon: ClipboardList, permission: ["ANALYTICS_VIEW", "FINANCE_VIEW"] },
  { href: "/shop/team", label: "Team", icon: UserCog, permission: "EMPLOYEE_VIEW" },
  { href: "/shop/subscription", label: "Subscription", icon: Crown, permission: "SUBSCRIPTION_VIEW" },
  { href: "/shop/settings", label: "Settings", icon: Settings, permission: "SETTINGS_VIEW" },
];

/** First page this user is allowed to see (used after login and as nav fallback). */
export function firstAllowedPath(can: (...perms: string[]) => boolean): string {
  for (const item of SHOP_NAV) {
    if (!item.permission) return item.href;
    const perms = Array.isArray(item.permission) ? item.permission : [item.permission];
    if (can(...perms)) return item.href;
  }
  return "/shop/dashboard";
}
