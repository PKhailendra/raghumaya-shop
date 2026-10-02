"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { inventoryApi } from "@/lib/api";
import { PageHeader } from "@/components/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useShop } from "@/lib/shop-context";

/**
 * Printable barcode labels. Uses JsBarcode via CDN for rendering.
 * Select products, set quantity, print.
 */
export default function BarcodePrintPage() {
  const { can } = useShop();
  if (!can("INVENTORY_VIEW")) return <div className="p-4 text-sm text-gray-500">No permission.</div>;
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Record<string, number>>({});

  const products = useQuery({
    queryKey: ["shop", "products", search],
    queryFn: () => inventoryApi.products({ search: search || undefined, limit: 50 }),
    enabled: can("INVENTORY_VIEW"),
  });

  const toggle = (id: string) => {
    setSelected((p) => {
      const n = { ...p };
      if (n[id]) delete n[id];
      else n[id] = 1;
      return n;
    });
  };

  const items = (products.data?.data ?? []).filter((p: any) => selected[p.id]);

  const printLabels = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    const labels = items
      .map((p: any) => {
        const qty = selected[p.id] ?? 1;
        const barcode = p.barcode || p.sku || p.id;
        return Array(qty)
          .fill(0)
          .map(
            () => `
          <div class="label">
            <div class="name">${p.name}</div>
            <svg class="barcode" data-value="${barcode}"></svg>
            <div class="code">${barcode}</div>
            <div class="price">₹${p.sellingPrice ?? p.price ?? ""}</div>
          </div>`
          )
          .join("");
      })
      .join("");
    w.document.write(`
      <html><head><title>Barcode Labels</title>
      <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
      <style>
        body { font-family: sans-serif; margin: 0; padding: 10px; }
        .label { width: 180px; height: 110px; border: 1px dashed #ccc; display: inline-block;
                 margin: 5px; padding: 5px; text-align: center; vertical-align: top; page-break-inside: avoid; }
        .name { font-size: 11px; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .barcode { width: 160px; height: 45px; }
        .code { font-size: 10px; font-family: monospace; }
        .price { font-size: 13px; font-weight: bold; }
        @media print { body { padding: 0; } .label { border: 1px solid #000; } }
      </style></head><body>${labels}
      <script>
        document.querySelectorAll('.barcode').forEach(el => {
          try { JsBarcode(el, el.dataset.value, { format: 'CODE128', width: 1.5, height: 40, displayValue: false }); }
          catch(e) { el.outerHTML = '<div>' + el.dataset.value + '</div>'; }
        });
        setTimeout(() => window.print(), 500);
      </script></body></html>`);
    w.document.close();
  };

  return (
    <div>
      <PageHeader title="Print barcodes" description="Select products and print barcode labels." />
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Products</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} />
              <div className="max-h-96 overflow-y-auto space-y-1">
                {(products.data?.data ?? []).map((p: any) => (
                  <label key={p.id} className="flex items-center gap-2 p-2 border rounded cursor-pointer hover:bg-gray-50">
                    <input type="checkbox" checked={!!selected[p.id]} onChange={() => toggle(p.id)} />
                    <span className="flex-1 text-sm">{p.name}</span>
                    <span className="text-xs text-gray-500">{p.barcode || p.sku || "No barcode"}</span>
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Selected labels ({items.length})</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {items.map((p: any) => (
                <div key={p.id} className="flex items-center gap-2">
                  <span className="flex-1 text-sm">{p.name}</span>
                  <Label className="text-xs">Qty</Label>
                  <Input
                    type="number" min="1" max="100" className="w-20"
                    value={selected[p.id]}
                    onChange={(e) => setSelected((prev) => ({ ...prev, [p.id]: Math.max(1, Number(e.target.value) || 1) }))}
                  />
                </div>
              ))}
              {items.length === 0 && <p className="text-sm text-gray-500">No products selected.</p>}
              <Button onClick={printLabels} disabled={items.length === 0} className="w-full">
                Print labels
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
  );
}
