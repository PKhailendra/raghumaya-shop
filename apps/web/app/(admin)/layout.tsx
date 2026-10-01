"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Store,
  Users,
  BadgeIndianRupee,
  Wallet,
  ClipboardCheck,
  LifeBuoy,
  Bell,
  FileBarChart,
  ShieldCheck,
  Settings,
  Lock,
} from "lucide-react";
import { AppShell, type NavItem } from "@/components/app-shell";
import { useAuth, isPlatformAdmin } from "@/lib/auth";

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/shops", label: "Shops", icon: Store },
  { href: "/users", label: "Users", icon: Users },
  { href: "/subscriptions", label: "Subscriptions", icon: BadgeIndianRupee },
  { href: "/finance", label: "Finance", icon: Wallet },
  { href: "/approvals", label: "Approvals", icon: ClipboardCheck },
  { href: "/support", label: "Support", icon: LifeBuoy },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/reports", label: "Reports", icon: FileBarChart },
  { href: "/audit-logs", label: "Audit Logs", icon: ShieldCheck },
  { href: "/security", label: "Security", icon: Lock },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { account, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!account) router.replace("/login");
    else if (!isPlatformAdmin(account)) router.replace("/shop/dashboard");
  }, [account, loading, router]);

  if (loading || !account || !isPlatformAdmin(account)) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <AppShell items={NAV} title="Admin Panel">
      {children}
    </AppShell>
  );
}
