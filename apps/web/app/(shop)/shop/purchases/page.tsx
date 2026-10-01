"use client";

import type React from "react";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { purchasesApi, ApiError, type PurchaseItem } from "@/lib/api";
import { formatDateTime, inr, toTitle } from "@/lib/format";
import { PageHeader, ErrorState, EmptyState, TableSkeleton } from "@/components/states";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProductPicker } from "@/components/product-picker";
import { Can } from "@/lib/shop-context";
import { Plus, Trash2 } from "lucide-react";

export default function ShopPurchasesPage() {
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["shop", "purchases", page],
    queryFn: () => purchasesApi.list({ page, limit: 20 }),
  });

  const rows = query.data?.data ?? [];
  const total = query.data?.meta.total ?? 0;

  return (
    <div>
      <PageHeader
        title="Purchases"
        description="Purchase orders from suppliers. Stock is updated automatically."
        actions={
          <Can any={["STOCK_ADJUST"]}>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New purchase
            </Button>
          </Can>
        }
      />

      {query.isLoading ? (
        <TableSkeleton />
      ) : query.isError ? (
        <ErrorState
          message={query.error instanceof ApiError ? query.error.message : "Could not load purchases."}
          onRetry={() => query.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No purchases yet"
          description="Record a purchase to add stock."
          action={
            <Can any={["STOCK_ADJUST"]}>
              <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New purchase</Button>
            </Can>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Purchase no.</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.purchaseNumber}</TableCell>
                    <TableCell>{p.supplierName ?? "-"}</TableCell>
                    <TableCell>{formatDateTime(p.invoiceDate)}</TableCell>
                    <TableCell className="text-right">{inr(p.totalAmount)}</TableCell>
                    <TableCell className="text-right">{inr(p.paidAmount)}</TableCell>
                    <TableCell><Badge variant="secondary">{toTitle(p.status)}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Pagination page={page} limit={20} total={total} onPageChange={setPage} />

      {createOpen && (
        <PurchaseDialog
          onClose={() => setCreateOpen(false)}
          onDone={() => { setCreateOpen(false); queryClient.invalidateQueries({ queryKey: ["shop", "purchases"] }); }}
        />
      )}
    </div>
  );
}

function PurchaseDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState<PurchaseItem[]>([{ productId: "", quantity: 1, unitPrice: "" }]);
  const [selectedProducts, setSelectedProducts] = useState<Record<string, import("@/lib/api").Product>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const updateItem = (i: number, patch: Partial<PurchaseItem>) => {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  };

  const total = items.reduce((s, it) => s + Number(it.quantity || 0) * Number(it.unitPrice || 0), 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const valid = items.filter((it) => it.productId.trim() && Number(it.quantity) > 0 && Number(it.unitPrice) >= 0);
    if (valid.length === 0) return setError("Add at least one item with a product, quantity and price.");
    setBusy(true);
    try {
      await purchasesApi.create({
        invoiceDate,
        items: valid.map((it) => ({
          productId: it.productId.trim(),
          quantity: Number(it.quantity),
          unitPrice: String(it.unitPrice),
        })),
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the purchase.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New purchase</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="text-sm text-destructive">{error}</div>}
          <div className="space-y-2">
            <Label htmlFor="pu-date">Purchase date</Label>
            <Input id="pu-date" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Items</Label>
            {items.map((it, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-start">
                <div className="col-span-5">
                  <ProductPicker
                    value={it.productId ? selectedProducts[it.productId] ?? null : null}
                    onSelect={(p) => {
                      if (p) setSelectedProducts((prev) => ({ ...prev, [p.id]: p }));
                      updateItem(i, {
                        productId: p?.id ?? "",
                        unitPrice: p ? (p.purchasePrice || p.sellingPrice) : it.unitPrice,
                      });
                    }}
                  />
                </div>
                <Input className="col-span-2" type="number" min="1" placeholder="Qty" value={it.quantity} onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })} />
                <Input className="col-span-4" type="number" min="0" step="0.01" placeholder="Unit price" value={it.unitPrice} onChange={(e) => updateItem(i, { unitPrice: e.target.value })} />
                <Button type="button" size="icon" variant="ghost" className="col-span-1" onClick={() => setItems((p) => p.filter((_, idx) => idx !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setItems((p) => [...p, { productId: "", description: "", quantity: 1, unitPrice: "" }])}
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Add item
            </Button>
          </div>

          <div className="text-right font-semibold">Total: {inr(total)}</div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Create purchase"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
