"use client";

import type { ReactNode } from "react";
import { useShop } from "@/lib/shop-context";

interface CanProps {
  permission?: string | string[];
  any?: string[];
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Permission gate for UI elements.
 * - permission: single permission or array (all required)
 * - any: array where at least one permission is required
 */
export function Can({ permission, any, children, fallback = null }: CanProps) {
  const { can } = useShop();

  let allowed = true;
  if (permission) {
    const perms = Array.isArray(permission) ? permission : [permission];
    allowed = perms.every((p) => can(p));
  }
  if (any && any.length > 0) {
    allowed = allowed && any.some((p) => can(p));
  }

  return allowed ? <>{children}</> : <>{fallback}</>;
}
