"use client";
import type React from "react";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi, ApiError, SHOP_TYPE_OPTIONS } from "@/lib/api";
import { formatDateTime, toTitle } from "@/lib/format";
import { PageHeader, ErrorState, EmptyState, TableSkeleton } from "@/components/states";
import { Pagination } from "@/components/pagination";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, Plus } from "lucide-react";

const STATUS_VARIANTS: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  ACTIVE: "success",
  SUSPENDED: "warning",
  BLOCKED: "destructive",
};

export default function AdminShopsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [confirm, setConfirm] = useState<{ action: string; id: string; name: string } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["admin", "shops", page, search, status],
    queryFn: () => adminApi.shops({ page, limit: 20, search: search || undefined, status: status || undefined }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin", "shops"] });

  const mutate = useMutation({
    mutationFn: async () => {
      if (!confirm) return;
      const { action, id } = confirm;
      if (action === "suspend") await adminApi.suspendShop(id);
      if (action === "activate") await adminApi.activateShop(id);
      if (action === "delete") await adminApi.deleteShop(id);
    },
    onSuccess: invalidate,
  });

  const shops = query.data?.data ?? [];
  const total = query.data?.meta.total ?? 0;

  return (
    <div>
      <PageHeader
        title="Shops"
        description="Manage all tenant shops on the platform."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Add shop
          </Button>
        }
      />

      <CreateShopDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onShopCreated={invalidate}
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search shops by name, email or phone…"
            className="pl-9"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Select
          className="w-full sm:w-48"
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          placeholder="All statuses"
          options={[
            { value: "", label: "All statuses" },
            { value: "ACTIVE", label: "Active" },
            { value: "SUSPENDED", label: "Suspended" },
          ]}
        />
      </div>

      {query.isLoading ? (
        <TableSkeleton />
      ) : query.isError ? (
        <ErrorState
          message={query.error instanceof ApiError ? query.error.message : "Could not load shops."}
          onRetry={() => query.refetch()}
        />
      ) : shops.length === 0 ? (
        <EmptyState title="No shops found" description="Try a different search or create a new shop." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Shop</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shops.map((shop) => (
                  <TableRow key={shop.id}>
                    <TableCell>
                      <Link href={`/shops/${shop.id}`} className="font-medium hover:underline">
                        {shop.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">{shop.email}</div>
                    </TableCell>
                    <TableCell>{shop.phone ?? "-"}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANTS[shop.status] ?? "secondary"}>{toTitle(shop.status)}</Badge>
                    </TableCell>
                    <TableCell>{formatDateTime(shop.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {shop.status !== "ACTIVE" && (
                          <Button size="sm" variant="outline" onClick={() => setConfirm({ action: "activate", id: shop.id, name: shop.name })}>
                            Activate
                          </Button>
                        )}
                        {shop.status === "ACTIVE" && (
                          <Button size="sm" variant="outline" onClick={() => setConfirm({ action: "suspend", id: shop.id, name: shop.name })}>
                            Suspend
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setConfirm({ action: "delete", id: shop.id, name: shop.name })}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Pagination page={page} limit={20} total={total} onPageChange={setPage} />

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(v) => !v && setConfirm(null)}
        title={`${confirm?.action ? toTitle(confirm.action) : ""} shop`}
        description={`Are you sure you want to ${confirm?.action} "${confirm?.name}"?`}
        confirmLabel={confirm ? toTitle(confirm.action) : "Confirm"}
        destructive={confirm?.action === "delete"}
        busy={mutate.isPending}
        onConfirm={() => mutate.mutateAsync()}
      />
    </div>
  );
}

function CreateShopDialog({
  open,
  onOpenChange,
  onShopCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onShopCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [shopType, setShopType] = useState("RETAIL");
  const [gstNumber, setGstNumber] = useState("");
  const [shopPhone, setShopPhone] = useState("");
  const [shopAddress, setShopAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [ownerQuery, setOwnerQuery] = useState("");
  const [ownerResults, setOwnerResults] = useState<{ id: string; fullName: string; email?: string; phone: string }[]>([]);
  const [selectedOwner, setSelectedOwner] = useState<{ id: string; fullName: string; email?: string; phone: string } | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setName("");
    setOwnerName("");
    setEmail("");
    setPhone("");
    setPassword("");
    setShopType("RETAIL");
    setGstNumber("");
    setShopPhone("");
    setShopAddress("");
    setCity("");
    setState("");
    setPincode("");
    setReferralCode("");
    setMode("new");
    setOwnerQuery("");
    setOwnerResults([]);
    setSelectedOwner(null);
    setError(null);
  };

  const searchOwners = async (q: string) => {
    setOwnerQuery(q);
    setSelectedOwner(null);
    if (q.trim().length < 2) {
      setOwnerResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await adminApi.searchOwners(q.trim());
      const list = Array.isArray(res) ? res : (res as unknown as { data?: typeof ownerResults })?.data ?? [];
      setOwnerResults(list);
    } catch {
      setOwnerResults([]);
    } finally {
      setSearching(false);
    }
  };

  const close = () => {
    reset();
    setNotice(null);
    setDone(false);
    onOpenChange(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!name.trim()) return setError("Shop name is required.");
    if (gstNumber.trim() && !/^[0-9A-Z]{15}$/i.test(gstNumber.trim()))
      return setError("GST number must be 15 characters (e.g. 22AAAAA0000A1Z5).");

    if (mode === "existing") {
      // Create shop for an existing owner — no new account.
      if (!selectedOwner) return setError("Please search and select the existing owner first.");
      setBusy(true);
      try {
        await adminApi.createShopForOwner({
          ownerAccountId: selectedOwner.id,
          shopName: name.trim(),
          email: email.trim() || undefined,
          shopPhone: shopPhone.trim() || undefined,
          shopAddress: shopAddress.trim() || undefined,
          city: city.trim() || undefined,
          state: state.trim() || undefined,
          pincode: pincode.trim() || undefined,
          gstNumber: gstNumber.trim() || undefined,
          shopType: shopType || undefined,
        });
        reset();
        setDone(true);
        onShopCreated();
        setNotice(
          `Shop created successfully and linked to ${selectedOwner.fullName}. They can switch to it from their shop switcher.`
        );
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not create the shop.");
      } finally {
        setBusy(false);
      }
      return;
    }

    // New owner mode — create account + shop together.
    if (!ownerName.trim()) return setError("Owner name is required.");
    if (phone.trim().length < 7) return setError("A valid owner phone number is required.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    setBusy(true);
    try {
      const res = await adminApi.createShop({
        name: name.trim(),
        ownerName: ownerName.trim(),
        email: email.trim() || undefined,
        phone: phone.trim(),
        password,
        shopType,
        gstNumber: gstNumber.trim() || undefined,
        shopPhone: shopPhone.trim() || undefined,
        shopAddress: shopAddress.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        pincode: pincode.trim() || undefined,
        referralCode: referralCode.trim() || undefined,
      });
      const emailed = (res as { credentialsEmailed?: boolean })?.credentialsEmailed;
      const ownerEmail = email.trim();
      reset();
      setDone(true);
      onShopCreated();
      setNotice(
        emailed
          ? `Shop created successfully. Login credentials have been emailed to ${ownerEmail}.`
          : ownerEmail
            ? "Shop created successfully, but the credentials email could not be sent (email sending is not configured on the server)."
            : "Shop created successfully. No owner email was given, so no credentials email was sent — share the login ID and password with the owner manually."
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the shop.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add shop</DialogTitle>
          <DialogDescription>Create a new tenant shop. Fields marked * are required.</DialogDescription>
        </DialogHeader>
        {done ? (
          <div className="space-y-4 py-2">
            {notice && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">{notice}</div>}
            <DialogFooter>
              <Button onClick={close}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
        <form onSubmit={submit} className="space-y-5">
          {error && <div className="text-sm text-destructive">{error}</div>}
          {notice && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">{notice}</div>}

          <div className="flex gap-2 p-1 bg-muted rounded-md">
            <Button
              type="button"
              variant={mode === "new" ? "default" : "ghost"}
              size="sm"
              className="flex-1"
              onClick={() => { setMode("new"); setSelectedOwner(null); }}
            >
              New owner
            </Button>
            <Button
              type="button"
              variant={mode === "existing" ? "default" : "ghost"}
              size="sm"
              className="flex-1"
              onClick={() => setMode("existing")}
            >
              Existing owner
            </Button>
          </div>

          {mode === "existing" && (
            <div>
              <div className="text-sm font-semibold mb-3">Select owner *</div>
              <div className="space-y-2">
                <Input
                  value={ownerQuery}
                  onChange={(e) => searchOwners(e.target.value)}
                  placeholder="Search by name, email or phone (min 2 chars)"
                />
                {searching && <p className="text-xs text-muted-foreground">Searching…</p>}
                {selectedOwner ? (
                  <div className="flex items-center justify-between rounded-md border px-3 py-2 bg-green-50 border-green-200">
                    <div>
                      <div className="text-sm font-medium">{selectedOwner.fullName}</div>
                      <div className="text-xs text-muted-foreground">{selectedOwner.email ?? selectedOwner.phone}</div>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => { setSelectedOwner(null); setOwnerQuery(""); setOwnerResults([]); }}>
                      Change
                    </Button>
                  </div>
                ) : (
                  ownerResults.length > 0 && (
                    <div className="rounded-md border divide-y max-h-48 overflow-y-auto">
                      {ownerResults.map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-accent"
                          onClick={() => { setSelectedOwner(o); setOwnerResults([]); }}
                        >
                          <div className="text-sm font-medium">{o.fullName}</div>
                          <div className="text-xs text-muted-foreground">{o.email ?? o.phone} · {o.phone}</div>
                        </button>
                      ))}
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          <div>
            <div className="text-sm font-semibold mb-3">Shop information</div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cs-name">Shop name *</Label>
                  <Input id="cs-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sharma General Store" />
                </div>
                <div className="space-y-2">
                  <Label>Shop type *</Label>
                  <Select value={shopType} onChange={setShopType} options={[...SHOP_TYPE_OPTIONS]} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cs-shopphone">Shop phone <span className="text-muted-foreground">(optional)</span></Label>
                  <Input id="cs-shopphone" value={shopPhone} onChange={(e) => setShopPhone(e.target.value)} placeholder="Defaults to owner phone" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cs-gst">GST number <span className="text-muted-foreground">(optional)</span></Label>
                  <Input id="cs-gst" value={gstNumber} onChange={(e) => setGstNumber(e.target.value.toUpperCase())} placeholder="15-character GSTIN" maxLength={15} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cs-address">Shop address <span className="text-muted-foreground">(optional)</span></Label>
                <Input id="cs-address" value={shopAddress} onChange={(e) => setShopAddress(e.target.value)} placeholder="Street, area, landmark" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cs-city">City <span className="text-muted-foreground">(optional)</span></Label>
                  <Input id="cs-city" value={city} onChange={(e) => setCity(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cs-state">State <span className="text-muted-foreground">(optional)</span></Label>
                  <Input id="cs-state" value={state} onChange={(e) => setState(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cs-pincode">Pincode <span className="text-muted-foreground">(optional)</span></Label>
                  <Input id="cs-pincode" value={pincode} onChange={(e) => setPincode(e.target.value)} maxLength={10} />
                </div>
              </div>
            </div>
          </div>

          {mode === "new" ? (
          <div>
            <div className="text-sm font-semibold mb-3">Owner information</div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cs-owner">Owner name *</Label>
                <Input id="cs-owner" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Full name of the shop owner" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cs-email">Owner email</Label>
                  <Input id="cs-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Login credentials will be emailed here" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cs-phone">Owner phone *</Label>
                  <Input id="cs-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Also works as login ID" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cs-password">Owner password *</Label>
                  <Input id="cs-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimum 8 characters" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cs-referral">Referral code <span className="text-muted-foreground">(optional)</span></Label>
                  <Input id="cs-referral" value={referralCode} onChange={(e) => setReferralCode(e.target.value)} placeholder="If referred by someone" />
                </div>
              </div>
            </div>
          </div>
          ) : (
          <div>
            <div className="text-sm font-semibold mb-3">Shop contact <span className="text-muted-foreground font-normal">(optional — defaults to owner details)</span></div>
            <div className="space-y-2">
              <Label htmlFor="cs-email2">Shop email</Label>
              <Input id="cs-email2" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Defaults to owner email" />
            </div>
          </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create shop"}
            </Button>
          </DialogFooter>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
