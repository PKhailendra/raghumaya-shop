"use client";
import type React from "react";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi, ApiError } from "@/lib/api";
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
        onCreated={() => {
          setCreateOpen(false);
          invalidate();
        }}
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
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Shop name is required.");
    if (!ownerName.trim()) return setError("Owner name is required.");
    if (phone.trim().length < 7) return setError("A valid owner phone number is required.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    setBusy(true);
    try {
      await adminApi.createShop({
        name: name.trim(),
        ownerName: ownerName.trim(),
        email: email.trim() || undefined,
        phone: phone.trim(),
        password,
      });
      setName("");
      setOwnerName("");
      setEmail("");
      setPhone("");
      setPassword("");
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the shop.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add shop</DialogTitle>
          <DialogDescription>Create a new tenant shop and its owner account.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="text-sm text-destructive">{error}</div>}
          <div className="space-y-2">
            <Label htmlFor="cs-name">Shop name *</Label>
            <Input id="cs-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cs-owner">Owner name *</Label>
            <Input id="cs-owner" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cs-email">Owner email</Label>
              <Input id="cs-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cs-phone">Owner phone *</Label>
              <Input id="cs-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cs-password">Owner password *</Label>
            <Input id="cs-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimum 8 characters" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create shop"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
