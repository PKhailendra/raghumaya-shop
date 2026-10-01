"use client";

import type React from "react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { stockApi, ApiError, type Warehouse, type StockLevel } from "@/lib/api";
import { Can } from "@/lib/shop-context";
import { formatDateTime, toTitle } from "@/lib/format";
import { PageHeader, ErrorState, EmptyState, TableSkeleton } from "@/components/states";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, ArrowRightLeft, Plus } from "lucide-react";

export default function ShopStockPage() {
  const [page, setPage] = useState(1);
  const [warehouseId, setWarehouseId] = useState("");
  const [transferOpen, setTransferOpen] = useState(false);
  const [warehouseOpen, setWarehouseOpen] = useState(false);
  const queryClient = useQueryClient();

  const warehouses = useQuery({ queryKey: ["shop", "warehouses"], queryFn: () => stockApi.warehouses() });
  const levels = useQuery({
    queryKey: ["shop", "stock-levels", page, warehouseId],
    queryFn: () => stockApi.levels({ page, limit: 20, warehouseId: warehouseId || undefined }),
  });
  const movements = useQuery({
    queryKey: ["shop", "stock-movements", page],
    queryFn: () => stockApi.movements({ page, limit: 20 }),
  });
  const lowStock = useQuery({ queryKey: ["shop", "alerts", "low-stock"], queryFn: () => stockApi.lowStockAlerts() });
  const outOfStock = useQuery({ queryKey: ["shop", "alerts", "out-of-stock"], queryFn: () => stockApi.outOfStockAlerts() });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["shop", "stock-levels"] });
    queryClient.invalidateQueries({ queryKey: ["shop", "stock-movements"] });
    queryClient.invalidateQueries({ queryKey: ["shop", "alerts"] });
  };

  const whList = toList(warehouses.data);
  const warehouseOptions = [{ value: "", label: "All warehouses" }, ...whList.map((w) => ({ value: w.id, label: w.name }))];
  const warehouseNameOf = new Map(whList.map((w) => [w.id, w.name]));
  const levelRows = (levels.data?.data ?? []).map((l) => ({
    ...l,
    warehouseName: l.warehouseName ?? warehouseNameOf.get(l.warehouseId),
  }));
  const movementRows = movements.data?.data ?? [];

  return (
    <div>
      <PageHeader
        title="Stock"
        description="Stock levels, movements and transfers."
        actions={
          <Can any={["STOCK_ADJUST"]}>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setWarehouseOpen(true)}>
                <Plus className="h-4 w-4" /> Warehouse
              </Button>
              <Button onClick={() => setTransferOpen(true)}>
                <ArrowRightLeft className="h-4 w-4" /> Transfer
              </Button>
            </div>
          </Can>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <AlertCard
          title="Low stock"
          count={(lowStock.data ?? []).length}
          loading={lowStock.isLoading}
          items={(lowStock.data ?? []).slice(0, 5)}
        />
        <AlertCard
          title="Out of stock"
          count={(outOfStock.data ?? []).length}
          loading={outOfStock.isLoading}
          items={(outOfStock.data ?? []).slice(0, 5)}
          severe
        />
      </div>

      <Tabs defaultValue="levels">
        <TabsList>
          <TabsTrigger value="levels">Levels</TabsTrigger>
          <TabsTrigger value="movements">Movements</TabsTrigger>
        </TabsList>

        <TabsContent value="levels">
          <div className="mb-4 max-w-xs">
            <Select value={warehouseId} onChange={(v) => { setWarehouseId(v); setPage(1); }} options={warehouseOptions} />
          </div>
          {levels.isLoading ? (
            <TableSkeleton />
          ) : levels.isError ? (
            <ErrorState
              message={levels.error instanceof ApiError ? levels.error.message : "Could not load stock levels."}
              onRetry={() => levels.refetch()}
            />
          ) : levelRows.length === 0 ? (
            <EmptyState title="No stock records" description="Stock in items to see levels here." />
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Warehouse</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {levelRows.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell>
                          <div className="font-medium">{l.productName}</div>
                          {l.sku && <div className="text-xs text-muted-foreground font-mono">{l.sku}</div>}
                        </TableCell>
                        <TableCell>{l.warehouseName ?? "-"}</TableCell>
                        <TableCell className="text-right font-medium">{l.quantity}</TableCell>
                        <TableCell>
                          {l.quantity <= 0 ? (
                            <Badge variant="destructive">Out of stock</Badge>
                          ) : l.reorderLevel && l.quantity <= l.reorderLevel ? (
                            <Badge variant="warning">Low stock</Badge>
                          ) : (
                            <Badge variant="success">OK</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
          <Pagination page={page} limit={20} total={levels.data?.meta.total ?? 0} onPageChange={setPage} />
        </TabsContent>

        <TabsContent value="movements">
          {movements.isLoading ? (
            <TableSkeleton />
          ) : movements.isError ? (
            <ErrorState
              message={movements.error instanceof ApiError ? movements.error.message : "Could not load movements."}
              onRetry={() => movements.refetch()}
            />
          ) : movementRows.length === 0 ? (
            <EmptyState title="No movements" description="Stock ins, outs and transfers will be listed here." />
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead>Reference</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movementRows.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="whitespace-nowrap text-xs">{formatDateTime(m.createdAt)}</TableCell>
                        <TableCell>{m.productName ?? m.productId.slice(0, 8)}</TableCell>
                        <TableCell>
                          <Badge variant={m.type === "IN" || m.type === "PURCHASE" ? "success" : m.type === "TRANSFER" ? "info" : "secondary"}>
                            {toTitle(m.type)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">{m.quantity}</TableCell>
                        <TableCell className="text-xs">{m.referenceType ?? "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {transferOpen && (
        <TransferDialog warehouses={whList} onClose={() => setTransferOpen(false)} onDone={() => { setTransferOpen(false); invalidate(); }} />
      )}
      {warehouseOpen && (
        <WarehouseDialog onClose={() => setWarehouseOpen(false)} onDone={() => { setWarehouseOpen(false); queryClient.invalidateQueries({ queryKey: ["shop", "warehouses"] }); }} />
      )}
    </div>
  );
}

function toList(data: unknown): Warehouse[] {
  if (Array.isArray(data)) return data as Warehouse[];
  return ((data as { data?: Warehouse[] })?.data ?? []) as Warehouse[];
}

function AlertCard({ title, count, loading, items, severe }: { title: string; count: number; loading: boolean; items: StockLevel[]; severe?: boolean }) {
  return (
    <Card className={severe && count > 0 ? "border-destructive/50" : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className={`h-4 w-4 ${severe ? "text-destructive" : "text-amber-500"}`} />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-8 animate-pulse rounded bg-muted" />
        ) : (
          <>
            <div className="text-3xl font-bold">{count}</div>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {items.map((i) => (
                <li key={i.id}>• {i.productName} ({i.quantity})</li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function TransferDialog({ warehouses, onClose, onDone }: { warehouses: Warehouse[]; onClose: () => void; onDone: () => void }) {
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!fromId || !toId) return setError("Choose both warehouses.");
    if (fromId === toId) return setError("Warehouses must be different.");
    if (!productId.trim()) return setError("Product ID is required.");
    if (!quantity || Number(quantity) <= 0) return setError("Quantity must be greater than 0.");
    setBusy(true);
    try {
      await stockApi.transfer({
        fromWarehouseId: fromId,
        toWarehouseId: toId,
        items: [{ productId: productId.trim(), quantity: Number(quantity) }],
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Transfer failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Transfer stock</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="text-sm text-destructive">{error}</div>}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>From warehouse</Label>
              <Select value={fromId} onChange={setFromId} placeholder="Select…" options={warehouses.map((w) => ({ value: w.id, label: w.name }))} />
            </div>
            <div className="space-y-2">
              <Label>To warehouse</Label>
              <Select value={toId} onChange={setToId} placeholder="Select…" options={warehouses.map((w) => ({ value: w.id, label: w.name }))} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="t-product">Product ID</Label>
            <Input id="t-product" value={productId} onChange={(e) => setProductId(e.target.value)} placeholder="Paste the product ID" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="t-qty">Quantity</Label>
            <Input id="t-qty" type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Transferring…" : "Transfer"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function WarehouseDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Warehouse name is required.");
    setBusy(true);
    try {
      await stockApi.createWarehouse({ name: name.trim(), location: location.trim() || undefined });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the warehouse.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add warehouse</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="text-sm text-destructive">{error}</div>}
          <div className="space-y-2">
            <Label htmlFor="w-name">Name *</Label>
            <Input id="w-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="w-loc">Location</Label>
            <Input id="w-loc" value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
