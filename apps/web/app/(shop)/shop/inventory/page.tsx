"use client";

import type React from "react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { inventoryApi, ApiError, type Product } from "@/lib/api";
import { inr, toTitle } from "@/lib/format";
import { PageHeader, ErrorState, EmptyState, TableSkeleton } from "@/components/states";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Plus, ScanBarcode, Pencil, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Can } from "@/lib/shop-context";
import { BarcodeScanner } from "@/components/barcode-scanner";

export default function ShopInventoryPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [editor, setEditor] = useState<{ product?: Product } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [barcode, setBarcode] = useState("");
  const [barcodeResult, setBarcodeResult] = useState<Product | null>(null);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [barcodeBusy, setBarcodeBusy] = useState(false);
  const queryClient = useQueryClient();

  const products = useQuery({
    queryKey: ["shop", "products", page, search, categoryId],
    queryFn: () =>
      inventoryApi.products({ page, limit: 20, search: search || undefined, categoryId: categoryId || undefined }),
  });
  const categories = useQuery({
    queryKey: ["shop", "categories"],
    queryFn: () => inventoryApi.categories(),
  });
  const brands = useQuery({
    queryKey: ["shop", "brands"],
    queryFn: () => inventoryApi.brands(),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["shop", "products"] });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => inventoryApi.deleteProduct(id),
    onSuccess: invalidate,
  });

  const lookupBarcode = async (code?: string) => {
    const value = (code ?? barcode).trim();
    setBarcodeError(null);
    setBarcodeResult(null);
    if (!value) return;
    setBarcodeBusy(true);
    try {
      const p = await inventoryApi.lookup("barcode", value);
      setBarcodeResult(p);
    } catch (err) {
      setBarcodeError(err instanceof ApiError ? err.message : "Product not found.");
    } finally {
      setBarcodeBusy(false);
    }
  };

  const categoryOptions = toOptions(categories.data, "category");
  const brandOptions = toOptions(brands.data, "brand");
  const rows = products.data?.data ?? [];
  const total = products.data?.meta.total ?? 0;

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="Products, variants and batches."
        actions={
          <Can any={["INVENTORY_CREATE"]}>
            <Button onClick={() => setEditor({})}>
              <Plus className="h-4 w-4" /> Add product
            </Button>
          </Can>
        }
      />

      {/* Barcode lookup */}
      <Card className="mb-4">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <Label htmlFor="barcode">Barcode lookup</Label>
            <Input
              id="barcode"
              placeholder="Scan or type a barcode…"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && lookupBarcode()}
            />
          </div>
          <Button onClick={() => lookupBarcode()} disabled={barcodeBusy}>
            <ScanBarcode className="h-4 w-4 mr-1" /> {barcodeBusy ? "Looking up…" : "Look up"}
          </Button>
          <BarcodeScanner
            buttonLabel="Scan"
            onScan={(code) => {
              setBarcode(code);
              setTimeout(() => lookupBarcode(code), 50);
            }}
          />
        </CardContent>
        {(barcodeResult || barcodeError) && (
          <CardContent className="pt-0">
            {barcodeError && <div className="text-sm text-destructive">{barcodeError}</div>}
            {barcodeResult && (
              <div className="flex items-center justify-between rounded-md bg-muted p-3 text-sm">
                <div>
                  <div className="font-medium">{barcodeResult.name}</div>
                  <div className="text-xs text-muted-foreground">SKU {barcodeResult.sku} · Stock {barcodeResult.currentStock}</div>
                </div>
                <Can any={["INVENTORY_UPDATE"]}>
                  <Button size="sm" variant="outline" onClick={() => { setEditor({ product: barcodeResult }); }}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                  </Button>
                </Can>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search products…"
            className="pl-9"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select
          className="w-full sm:w-48"
          value={categoryId}
          onChange={(v) => { setCategoryId(v); setPage(1); }}
          placeholder="All categories"
          options={[{ value: "", label: "All categories" }, ...categoryOptions]}
        />
      </div>

      {products.isLoading ? (
        <TableSkeleton />
      ) : products.isError ? (
        <ErrorState
          message={products.error instanceof ApiError ? products.error.message : "Could not load products."}
          onRetry={() => products.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No products"
          description="Add your first product to start managing inventory."
          action={
            <Can any={["INVENTORY_CREATE"]}>
              <Button onClick={() => setEditor({})}><Plus className="h-4 w-4" /> Add product</Button>
            </Can>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="font-medium">{p.name}</div>
                      {p.barcode && <div className="text-xs text-muted-foreground font-mono">{p.barcode}</div>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                    <TableCell>{p.category?.name ?? "-"}</TableCell>
                    <TableCell className="text-right">{inr(p.sellingPrice)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={p.currentStock <= 0 ? "destructive" : p.currentStock < 10 ? "warning" : "success"}>
                        {p.currentStock}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Can any={["INVENTORY_UPDATE"]}>
                          <Button size="sm" variant="outline" onClick={() => setEditor({ product: p })}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </Can>
                        <Can any={["INVENTORY_DELETE"]}>
                          <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(p)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </Can>
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

      {editor && (
        <ProductEditor
          product={editor.product}
          categories={categoryOptions}
          brands={brandOptions}
          onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); invalidate(); }}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Delete product"
        description={`Delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        busy={deleteMutation.isPending}
        onConfirm={() => { void deleteMutation.mutateAsync(deleteTarget!.id); }}
      />
    </div>
  );
}

function toOptions(data: unknown, _kind: string): { value: string; label: string }[] {
  const list = Array.isArray(data) ? data : (data as { data?: unknown[] })?.data ?? [];
  return (list as { id: string; name: string }[]).map((c) => ({ value: c.id, label: c.name }));
}

function ProductEditor({
  product,
  categories,
  brands,
  onClose,
  onSaved,
}: {
  product?: Product;
  categories: { value: string; label: string }[];
  brands: { value: string; label: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(product?.name ?? "");
  const [sku, setSku] = useState(product?.sku ?? "");
  const [barcode, setBarcode] = useState(product?.barcode ?? "");
  const [qrCode, setQrCode] = useState(product?.qrCode ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "");
  const [brandId, setBrandId] = useState(product?.brandId ?? "");
  const [sellingPrice, setSellingPrice] = useState(product?.sellingPrice ?? "");
  const [purchasePrice, setPurchasePrice] = useState(product?.purchasePrice ?? "");
  const [mrp, setMrp] = useState(product?.mrp ?? "");
  const [gstRate, setGstRate] = useState(product?.gstRate ?? product?.taxRate ?? "0");
  const [hsnCode, setHsnCode] = useState(product?.hsnCode ?? "");
  const [unit, setUnit] = useState(product?.unit ?? "pcs");
  const [stock, setStock] = useState(product ? String(product.currentStock) : "0");
  const [reorderLevel, setReorderLevel] = useState(product?.reorderLevel != null ? String(product.reorderLevel) : "0");
  const [isActive, setIsActive] = useState(product?.isActive ?? true);
  const [images, setImages] = useState<{ url: string; isPrimary: boolean }[]>(
    product?.images?.map((img) => ({ url: img.url, isPrimary: !!img.isPrimary })) ?? []
  );
  const [variants, setVariants] = useState<{
    name: string; sku: string; barcode: string; qrCode: string;
    purchasePrice: string; sellingPrice: string; currentStock: string;
  }[]>(
    product?.variants?.map((v) => ({
      name: v.name ?? "", sku: v.sku ?? "", barcode: v.barcode ?? "", qrCode: "",
      purchasePrice: (v as { purchasePrice?: string }).purchasePrice ?? "",
      sellingPrice: v.price ?? "",
      currentStock: v.stockQuantity != null ? String(v.stockQuantity) : "",
    })) ?? []
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Product name is required.");
    if (!sku.trim()) return setError("SKU is required.");
    if (!categoryId) return setError("Category is required — it powers the inventory filters.");
    if (!sellingPrice || Number(sellingPrice) <= 0) return setError("Selling price must be greater than 0.");
    const stockNum = Number(stock);
    if (!Number.isFinite(stockNum) || stockNum < 0) return setError("Stock must be a non-negative number.");
    const reorderNum = Number(reorderLevel);
    if (!Number.isFinite(reorderNum) || reorderNum < 0) return setError("Reorder level must be a non-negative number.");
    setBusy(true);
    try {
      const body = {
        name: name.trim(),
        sku: sku.trim(),
        barcode: barcode.trim() || undefined,
        qrCode: qrCode.trim() || undefined,
        description: description.trim() || undefined,
        categoryId: categoryId || undefined,
        brandId: brandId || undefined,
        sellingPrice,
        purchasePrice: purchasePrice || undefined,
        mrp: mrp || undefined,
        gstRate,
        taxRate: gstRate,
        hsnCode: hsnCode.trim() || undefined,
        unit,
        currentStock: stockNum,
        reorderLevel: reorderNum,
        isActive,
        images: images.filter((img) => img.url.trim()).map((img, i) => ({
          url: img.url.trim(),
          isPrimary: img.isPrimary,
          sortOrder: i,
        })),
        variants: variants.filter((v) => v.name.trim()).map((v) => ({
          name: v.name.trim(),
          ...(v.sku.trim() ? { sku: v.sku.trim() } : {}),
          ...(v.barcode.trim() ? { barcode: v.barcode.trim() } : {}),
          ...(v.qrCode.trim() ? { qrCode: v.qrCode.trim() } : {}),
          ...(v.purchasePrice.trim() ? { purchasePrice: v.purchasePrice.trim() } : {}),
          ...(v.sellingPrice.trim() ? { sellingPrice: v.sellingPrice.trim() } : {}),
          ...(v.currentStock.trim() ? { currentStock: v.currentStock.trim() } : {}),
        })),
      };
      if (product) await inventoryApi.updateProduct(product.id, body);
      else await inventoryApi.createProduct(body);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the product.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product ? "Edit product" : "Add product"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="text-sm text-destructive">{error}</div>}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 col-span-2 sm:col-span-1">
              <Label htmlFor="p-name">Name *</Label>
              <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2 col-span-2 sm:col-span-1">
              <Label htmlFor="p-sku">SKU *</Label>
              <Input id="p-sku" value={sku} onChange={(e) => setSku(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-barcode">Barcode <span className="text-muted-foreground">(optional)</span></Label>
              <Input id="p-barcode" value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Scan or type barcode" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-qrcode">QR Code <span className="text-muted-foreground">(optional)</span></Label>
              <Input id="p-qrcode" value={qrCode} onChange={(e) => setQrCode(e.target.value)} placeholder="QR code value" />
            </div>
            <div className="space-y-2">
              <Label>Category *</Label>
              <Select value={categoryId} onChange={setCategoryId} placeholder="Select category" options={[{ value: "", label: "Select category" }, ...categories]} />
            </div>
            <div className="space-y-2">
              <Label>Brand <span className="text-muted-foreground">(optional)</span></Label>
              <Select value={brandId} onChange={setBrandId} placeholder="No brand" options={[{ value: "", label: "No brand" }, ...brands]} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label htmlFor="p-desc">Description <span className="text-muted-foreground">(optional)</span></Label>
              <Textarea id="p-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Product details, pack size, etc." rows={2} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-sell">Selling price *</Label>
              <Input id="p-sell" type="number" min="0" step="0.01" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-buy">Purchase price</Label>
              <Input id="p-buy" type="number" min="0" step="0.01" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-mrp">MRP</Label>
              <Input id="p-mrp" type="number" min="0" step="0.01" value={mrp} onChange={(e) => setMrp(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>GST rate</Label>
              <Select value={gstRate} onChange={setGstRate} options={["0", "5", "12", "18", "28"].map((g) => ({ value: g, label: `${g}%` }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-hsn">HSN Code <span className="text-muted-foreground">(optional)</span></Label>
              <Input id="p-hsn" value={hsnCode} onChange={(e) => setHsnCode(e.target.value)} placeholder="e.g. 0902" />
            </div>
            <div className="space-y-2">
              <Label>Unit</Label>
              <Select value={unit} onChange={setUnit} options={["pcs", "kg", "g", "ltr", "ml", "box", "pack"].map((u) => ({ value: u, label: toTitle(u) }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-stock">{product ? "Current stock" : "Opening stock"}</Label>
              <Input id="p-stock" type="number" min="0" step="1" value={stock} onChange={(e) => setStock(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-reorder">Reorder level <span className="text-muted-foreground">(optional)</span></Label>
              <Input id="p-reorder" type="number" min="0" step="1" value={reorderLevel} onChange={(e) => setReorderLevel(e.target.value)} placeholder="Alert below this stock" />
            </div>
            <div className="space-y-2 flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded" />
                Active product
              </label>
            </div>
          </div>

          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Product images <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Button type="button" variant="outline" size="sm" onClick={() => setImages([...images, { url: "", isPrimary: images.length === 0 }])}>
                + Add image
              </Button>
            </div>
            {images.map((img, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={img.url}
                  onChange={(e) => setImages(images.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                  placeholder="https://… image URL"
                  className="flex-1"
                />
                <label className="flex items-center gap-1 text-xs whitespace-nowrap cursor-pointer">
                  <input
                    type="radio"
                    name="primary-image"
                    checked={img.isPrimary}
                    onChange={() => setImages(images.map((x, j) => ({ ...x, isPrimary: j === i })))}
                  />
                  Primary
                </label>
                <Button type="button" variant="ghost" size="sm" onClick={() => setImages(images.filter((_, j) => j !== i))}>
                  ✕
                </Button>
              </div>
            ))}
            {images.length === 0 && <p className="text-xs text-muted-foreground">No images yet. Paste an image URL or leave empty.</p>}
          </div>

          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Variants <span className="text-muted-foreground font-normal">(optional — e.g. 500g / 1kg packs)</span></Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setVariants([...variants, { name: "", sku: "", barcode: "", qrCode: "", purchasePrice: "", sellingPrice: "", currentStock: "" }])}
              >
                + Add variant
              </Button>
            </div>
            {variants.map((v, i) => (
              <div key={i} className="rounded-md border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">Variant {i + 1}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setVariants(variants.filter((_, j) => j !== i))}>
                    Remove
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={v.name}
                    onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                    placeholder="Variant name * (e.g. 500g)"
                  />
                  <Input
                    value={v.sku}
                    onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, sku: e.target.value } : x)))}
                    placeholder="SKU (optional)"
                  />
                  <Input
                    value={v.barcode}
                    onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, barcode: e.target.value } : x)))}
                    placeholder="Barcode (optional)"
                  />
                  <Input
                    value={v.qrCode}
                    onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, qrCode: e.target.value } : x)))}
                    placeholder="QR code (optional)"
                  />
                  <Input
                    type="number" min="0" step="0.01"
                    value={v.purchasePrice}
                    onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, purchasePrice: e.target.value } : x)))}
                    placeholder="Purchase price (optional)"
                  />
                  <Input
                    type="number" min="0" step="0.01"
                    value={v.sellingPrice}
                    onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, sellingPrice: e.target.value } : x)))}
                    placeholder="Selling price (optional)"
                  />
                  <Input
                    type="number" min="0" step="1"
                    value={v.currentStock}
                    onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, currentStock: e.target.value } : x)))}
                    placeholder="Stock (optional)"
                  />
                </div>
              </div>
            ))}
            {variants.length === 0 && <p className="text-xs text-muted-foreground">No variants yet. Add if this product sells in multiple packs/sizes.</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : product ? "Save changes" : "Add product"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
