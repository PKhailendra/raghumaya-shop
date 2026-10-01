"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "./auth";
import { shopsApi } from "./api";

export type ShopContextValue = {
  role: string | null;
  permissions: string[];
  membershipId: string | null;
  loading: boolean;
  /** True when the signed-in user holds ANY of the given permission keys. Platform admins always pass. */
  can: (...perms: string[]) => boolean;
  refresh: () => Promise<void>;
};

const ShopContext = createContext<ShopContextValue | null>(null);

export function ShopProvider({ children }: { children: ReactNode }) {
  const { account, activeShopId } = useAuth();
  const [role, setRole] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [membershipId, setMembershipId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!activeShopId || !account || account.type !== "shop") {
      setRole(null);
      setPermissions([]);
      setMembershipId(null);
      return;
    }
    setLoading(true);
    try {
      const ctx = await shopsApi.context();
      setRole(ctx.role);
      setPermissions(ctx.permissions ?? []);
      setMembershipId(ctx.membershipId ?? null);
    } catch {
      setRole(null);
      setPermissions([]);
      setMembershipId(null);
    } finally {
      setLoading(false);
    }
  }, [activeShopId, account]);

  useEffect(() => {
    load();
  }, [load]);

  const can = useCallback(
    (...perms: string[]) => {
      if (!account) return false;
      if (account.type === "admin") return true;
      if (role === "OWNER") return true;
      return perms.some((p) => permissions.includes(p));
    },
    [account, role, permissions]
  );

  const value = useMemo<ShopContextValue>(
    () => ({ role, permissions, membershipId, loading, can, refresh: load }),
    [role, permissions, membershipId, loading, can, load]
  );

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShop(): ShopContextValue {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error("useShop must be used within ShopProvider");
  return ctx;
}

/** Render children only when the user holds any of the given permissions. */
export function Can({ any, children }: { any: string[]; children: ReactNode }) {
  const { can } = useShop();
  if (!can(...any)) return null;
  return <>{children}</>;
}
