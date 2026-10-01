"use client";
import type React from "react";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authApi, setAccessToken, setRefreshToken } from "@/lib/api";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert } from "@/components/ui/alert";
import { isPlatformAdmin } from "@/lib/auth";

function VerifyOtpInner() {
  const router = useRouter();
  const [challenge, setChallenge] = useState<{ challengeId: string; methods: string[] } | null>(null);
  const [method, setMethod] = useState("sms");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem("rms_challenge");
    if (!raw) {
      router.replace("/login");
      return;
    }
    const parsed = JSON.parse(raw);
    setChallenge(parsed);
    if (parsed.methods?.length > 0) setMethod(parsed.methods[0].toLowerCase());
  }, [router]);

  const sendCode = async () => {
    if (!challenge) return;
    setError(null);
    try {
      await authApi.challengeSend({ challengeId: challenge.challengeId, method });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send the code. Try again.");
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challenge) return;
    setError(null);
    if (code.trim().length !== 6) return setError("Enter the 6-digit code.");
    setBusy(true);
    try {
      const res = await authApi.challengeVerify({ challengeId: challenge.challengeId, code: code.trim() });
      setAccessToken(res.accessToken);
      setRefreshToken(res.refreshToken);
      localStorage.setItem("rms_account", JSON.stringify(res.account));
      sessionStorage.removeItem("rms_challenge");
      window.location.href = isPlatformAdmin(res.account) ? "/dashboard" : "/shop/dashboard";
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Verification failed. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!challenge) return <div className="min-h-screen flex items-center justify-center text-sm">Loading…</div>;

  const methodOptions = challenge.methods.map((m) => m.toLowerCase());

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Two-factor verification</CardTitle>
          <CardDescription>Choose how you want to receive your verification code.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={method} onValueChange={(v) => { setMethod(v); setSent(false); }}>
            <TabsList className="w-full">
              {methodOptions.map((m) => (
                <TabsTrigger key={m} value={m} className="flex-1 capitalize">
                  {m}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {error && <Alert variant="error">{error}</Alert>}
          {sent && <Alert variant="success">Code sent via {method}. Check your {method === "sms" ? "phone" : method}.</Alert>}
          <Button variant="outline" className="w-full" onClick={sendCode}>
            Send code via {method}
          </Button>
          <form onSubmit={verify} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">6-digit code</Label>
              <Input
                id="code"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="text-center text-2xl tracking-[0.5em]"
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Verifying…" : "Verify and sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function VerifyOtpPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm">Loading…</div>}>
      <VerifyOtpInner />
    </Suspense>
  );
}
