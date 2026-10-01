"use client";

import type React from "react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { shopsApi, authApi, ApiError } from "@/lib/api";
import { Can } from "@/lib/shop-context";
import { formatDateTime } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { PageHeader, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import { KeyRound, MonitorSmartphone, Trash2 } from "lucide-react";

export default function ShopSettingsPage() {
  const { activeShopId, account } = useAuth();
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);

  const shop = useQuery({
    queryKey: ["shop", "profile", activeShopId],
    queryFn: () => shopsApi.get(activeShopId!),
    enabled: !!activeShopId,
  });

  const devices = useQuery({
    queryKey: ["auth", "devices"],
    queryFn: () => authApi.devices(),
  });

  const [name, setName] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [gstNumber, setGstNumber] = useState<string | null>(null);

  const shopData = shop.data;
  const nameVal = name ?? (shopData?.name as string) ?? "";
  const phoneVal = phone ?? (shopData?.phone as string) ?? "";
  const emailVal = email ?? (shopData?.email as string) ?? "";
  const gstVal = gstNumber ?? (shopData?.gstNumber as string) ?? "";

  const updateMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => shopsApi.update(activeShopId!, body),
    onSuccess: () => {
      setSaved(true);
      setName(null);
      setPhone(null);
      setEmail(null);
      setGstNumber(null);
      queryClient.invalidateQueries({ queryKey: ["shop", "profile"] });
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const deleteDevice = useMutation({
    mutationFn: (id: string) => authApi.deleteDevice(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["auth", "devices"] }),
  });

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameVal.trim()) return;
    await updateMutation.mutateAsync({
      name: nameVal.trim(),
      phone: phoneVal.trim() || undefined,
      email: emailVal.trim() || undefined,
      gstNumber: gstVal.trim() || undefined,
    });
  };

  return (
    <div>
      <PageHeader title="Settings" description="Shop profile, security and devices." />

      <div className="max-w-2xl space-y-6">
        <Can any={["SETTINGS_UPDATE"]}>
        <Card>
          <CardHeader>
            <CardTitle>Shop profile</CardTitle>
          </CardHeader>
          <CardContent>
            {shop.isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : shop.isError ? (
              <ErrorState
                message={shop.error instanceof ApiError ? shop.error.message : "Could not load the shop profile."}
                onRetry={() => shop.refetch()}
              />
            ) : (
              <form onSubmit={saveProfile} className="space-y-4">
                {saved && <Alert variant="success">Profile saved.</Alert>}
                {updateMutation.isError && (
                  <Alert variant="error">
                    {updateMutation.error instanceof ApiError ? updateMutation.error.message : "Could not save the profile."}
                  </Alert>
                )}
                <div className="space-y-2">
                  <Label htmlFor="s-name">Shop name</Label>
                  <Input id="s-name" value={nameVal} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="s-phone">Phone</Label>
                    <Input id="s-phone" value={phoneVal} onChange={(e) => setPhone(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="s-email">Email</Label>
                    <Input id="s-email" type="email" value={emailVal} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="s-gst">GST number</Label>
                  <Input id="s-gst" value={gstVal} onChange={(e) => setGstNumber(e.target.value)} />
                </div>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? "Saving…" : "Save profile"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
        </Can>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" /> Change password
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PasswordForm />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MonitorSmartphone className="h-4 w-4" /> My devices
            </CardTitle>
          </CardHeader>
          <CardContent>
            {devices.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (devices.data ?? []).length === 0 ? (
              <div className="text-sm text-muted-foreground">No devices registered.</div>
            ) : (
              <ul className="space-y-2">
                {(devices.data ?? []).map((d) => (
                  <li key={d.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                    <div>
                      <div className="font-medium">{d.deviceName}</div>
                      <div className="text-xs text-muted-foreground">
                        {d.ipAddress ?? "-"} · last used {formatDateTime(d.lastUsedAt)}
                      </div>
                    </div>
                    <Button size="sm" variant="destructive" onClick={() => deleteDevice.mutate(d.id)} disabled={deleteDevice.isPending}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Signed in as</span>
              <span className="font-medium">{account?.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Role</span>
              <Badge variant="secondary">{account?.role}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (!current) return setError("Enter your current password.");
    if (next.length < 8) return setError("New password must be at least 8 characters.");
    if (next !== confirm) return setError("New passwords do not match.");
    setBusy(true);
    try {
      await authApi.changePassword({ currentPassword: current, newPassword: next });
      setDone(true);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not change the password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <Alert variant="error">{error}</Alert>}
      {done && <Alert variant="success">Password changed.</Alert>}
      <div className="space-y-2">
        <Label htmlFor="pw-cur">Current password</Label>
        <Input id="pw-cur" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="pw-new">New password</Label>
          <Input id="pw-new" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pw-conf">Confirm new password</Label>
          <Input id="pw-conf" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </div>
      </div>
      <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Change password"}</Button>
    </form>
  );
}
