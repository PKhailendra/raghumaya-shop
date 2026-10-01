"use client";
import type React from "react";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth, isPlatformAdmin } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginSkeleton() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <Skeleton className="h-96 w-full max-w-md" />
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!emailOrPhone.trim()) return setError("Please enter your email or phone number.");
    if (!password) return setError("Please enter your password.");
    setBusy(true);
    try {
      const res = await login(emailOrPhone.trim(), password);
      if ("requiresTwoFactor" in res && res.requiresTwoFactor) {
        sessionStorage.setItem("rms_challenge", JSON.stringify({ challengeId: res.challengeId, methods: res.methods }));
        router.replace("/verify-otp");
        return;
      }
      if ("requiresTwoFactor" in res && !res.requiresTwoFactor) {
        const next = searchParams.get("next");
        if (next && next.startsWith("/")) {
          router.replace(next);
        } else if (isPlatformAdmin(res.account)) {
          router.replace("/dashboard");
        } else {
          router.replace("/shop/dashboard");
        }
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-lg mb-2">
            R
          </div>
          <CardTitle>Welcome to RaghuMayaShop</CardTitle>
          <CardDescription>Sign in with your email or phone number and password.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <Alert variant="error">{error}</Alert>}
            <div className="space-y-2">
              <Label htmlFor="id">Email or phone</Label>
              <Input
                id="id"
                placeholder="you@example.com or 98765 43210"
                value={emailOrPhone}
                onChange={(e) => setEmailOrPhone(e.target.value)}
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link href="/forgot-password" className="text-xs text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
