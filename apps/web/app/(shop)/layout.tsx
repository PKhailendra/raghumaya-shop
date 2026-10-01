"use client";

import type React from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Boxes,
  ShoppingCart,
  Receipt,
  Users,
  Wallet,
  UserCog,
  Crown,
  Settings,
} from "lucide-react";
import { AppShell, ShopSwitcher, type NavItem } from "@/components/app-shell";
import { useAuth } from "@/lib/auth";

const NAV: NavItem[] = [
  { href: "/shop/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/shop/inventory", label: "Inventory", icon: Package },
  { href: "/shop/stock", label: "Stock", icon: Boxes },
  { href: "/shop/purchases", label: "Purchases", icon: ShoppingCart },
  { href: "/shop/billing", label: "Billing", icon: Receipt },
  { href: "/shop/customers", label: "Customers", icon: Users },
  { href: "/shop/finance", label: "Finance", icon: Wallet },
  { href: "/shop/team", label: "Team", icon: UserCog },
  { href: "/shop/subscription", label: "Subscription", icon: Crown },
  { href: "/shop/settings", label: "Settings", icon: Settings },
];

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  const { account, loading, activeShopId } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!account) router.replace("/login");
    else if (account.type === "admin" && (account.role === "SUPER_ADMIN" || account.role === "ADMIN")) {
      router.replace("/dashboard");
    }
  }, [account, loading, router]);

  if (loading || !account) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <AppShell items={NAV} title="My Shop" shopSwitcher={<ShopSwitcher />}>
      {!activeShopId && (account.memberships?.length ?? 0) > 0 ? (
        <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
          Select a shop from the switcher above to continue.
        </div>
      ) : (
        children
      )}
    </AppShell>
  );
}
