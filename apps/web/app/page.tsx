"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth, isPlatformAdmin } from "@/lib/auth";

export default function HomePage() {
  const { account, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!account) router.replace("/login");
    else if (isPlatformAdmin(account)) router.replace("/dashboard");
    else router.replace("/shop/dashboard");
  }, [account, loading, router]);

  return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading…</div>;
}
