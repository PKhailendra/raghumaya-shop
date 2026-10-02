"use client";

import type React from "react";
import { useEffect, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppShell, ShopSwitcher } from "@/components/app-shell";
import { useAuth } from "@/lib/auth";
import { ShopProvider, useShop } from "@/lib/shop-context";
import { SHOP_NAV, firstAllowedPath } from "@/lib/shop-nav";
import { useLang } from "@/lib/lang";

function ShopShell({ children }: { children: React.ReactNode }) {
  const { account, loading, activeShopId } = useAuth();
  const { can, loading: shopLoading } = useShop();
  const { t } = useLang();
  const router = useRouter();
  const pathname = usePathname();

  const items = useMemo(
    () => SHOP_NAV.filter((n) => !n.permission || can(...(Array.isArray(n.permission) ? n.permission : [n.permission]))).map((n) => ({ ...n, label: t(n.label) })),
    [can, t]
  );
  const allowedHrefs = useMemo(() => new Set(items.map((i) => i.href)), [items]);

  useEffect(() => {
    if (loading) return;
    if (!account) router.replace("/login");
    else if (account.type === "admin" && (account.role === "SUPER_ADMIN" || account.role === "ADMIN")) {
      router.replace("/dashboard");
    }
  }, [account, loading, router]);

  // Keep users off pages their role cannot access (deep links, OTP flow, role changes).
  useEffect(() => {
    if (loading || shopLoading || !account || account.type !== "shop" || !activeShopId) return;
    const base = pathname.split("?")[0];
    const onKnownPage = SHOP_NAV.some((n) => base === n.href || base.startsWith(n.href + "/"));
    const allowed = [...allowedHrefs].some((h) => base === h || base.startsWith(h + "/"));
    if (onKnownPage && !allowed) {
      router.replace(firstAllowedPath(can));
    }
  }, [loading, shopLoading, account, activeShopId, pathname, allowedHrefs, can, router]);

  if (loading || !account) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <AppShell items={items} title="My Shop" shopSwitcher={<ShopSwitcher />}>
      {!activeShopId && (account.memberships?.length ?? 0) > 0 ? (
        <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
          Select a shop from the switcher above to continue.
        </div>
      ) : activeShopId && !shopLoading && items.length === 0 ? (
        <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
          No pages assigned to your role yet. Please contact your shop owner.
        </div>
      ) : (
        children
      )}
    </AppShell>
  );
}

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <ShopProvider>
      <ShopShell>{children}</ShopShell>
    </ShopProvider>
  );
}
