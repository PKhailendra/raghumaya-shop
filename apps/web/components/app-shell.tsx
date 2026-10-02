"use client";
import type React from "react";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useLang } from "@/lib/lang";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Menu, X, LogOut, Store, ChevronDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

function SidebarContent({
  items,
  title,
  shopSwitcher,
  onNavigate,
}: {
  items: NavItem[];
  title: string;
  shopSwitcher?: React.ReactNode;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
          R
        </div>
        <div>
          <div className="font-bold leading-tight">{title}</div>
          <div className="text-xs text-muted-foreground">RaghuMayaShop</div>
        </div>
      </div>
      {shopSwitcher}
      <Separator />
      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <Separator />
      <div className="p-4 text-xs text-muted-foreground">RaghuMayaShop v1.0</div>
    </div>
  );
}

export function AppShell({
  items,
  title,
  shopSwitcher,
  children,
}: {
  items: NavItem[];
  title: string;
  shopSwitcher?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { account, logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r bg-background lg:block">
        <SidebarContent items={items} title={title} shopSwitcher={shopSwitcher} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 bg-background shadow-lg">
            <button
              aria-label="Close menu"
              className="absolute right-3 top-4"
              onClick={() => setMobileOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent items={items} title={title} shopSwitcher={shopSwitcher} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-background px-4">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex-1" />
          <LangToggle />
          <DropdownMenu>
            <DropdownMenuTrigger>
              <button className="flex items-center gap-2 rounded-md p-1 hover:bg-accent">
                <Avatar name={account?.name} />
                <div className="hidden text-left sm:block">
                  <div className="text-sm font-medium leading-none">{account?.name ?? "Account"}</div>
                  <div className="text-xs text-muted-foreground">{account?.email}</div>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                Signed in as {account?.email}
                <br />
                Role: {account?.role}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="h-4 w-4" /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-[1400px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}

export function ShopSwitcher() {
  const { account, switchShop, activeShopId } = useAuth();
  const memberships = account?.memberships ?? [];
  const active = memberships.find((m) => m.shopId === activeShopId);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (memberships.length === 0) return null;

  const doSwitch = async (shopId: string) => {
    if (shopId === activeShopId || busyId) return;
    setBusyId(shopId);
    setError(null);
    try {
      await switchShop(shopId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not switch shop.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="px-2 py-2">
      <DropdownMenu>
        <DropdownMenuTrigger>
          <button className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent">
            <Store className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate text-left font-medium">{active?.shopName ?? "Select shop"}</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-60">
          {memberships.map((m) => (
            <DropdownMenuItem key={m.shopId} onClick={() => doSwitch(m.shopId)}>
              <div className="flex-1 truncate">{m.shopName}</div>
              {m.shopId === activeShopId ? (
                <span className="text-xs text-primary">Active</span>
              ) : busyId === m.shopId ? (
                <span className="text-xs text-muted-foreground">Switching…</span>
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {error && <div className="mt-1 px-1 text-xs text-destructive">{error}</div>}
    </div>
  );
}

function LangToggle() {
  const { lang, setLang } = useLang();
  return (
    <button
      onClick={() => setLang(lang === "en" ? "hi" : "en")}
      className="rounded-md border px-2 py-1 text-xs font-medium hover:bg-accent"
      title={lang === "en" ? "हिंदी में देखें" : "View in English"}
    >
      {lang === "en" ? "हिंदी" : "English"}
    </button>
  );
}
