"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { inventoryApi, type Product } from "@/lib/api";
import { inr } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search } from "lucide-react";

/**
 * Searchable product picker. Mobile-friendly: type to search, tap to select.
 * Shows stock + price so staff pick the right product without knowing IDs.
 */
export function ProductPicker({
  label,
  value,
  onSelect,
  placeholder = "Search product by name, SKU or barcode…",
}: {
  label?: string;
  value?: Product | null;
  onSelect: (p: Product | null) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const results = useQuery({
    queryKey: ["shop", "product-picker", debounced],
    queryFn: () => inventoryApi.products({ search: debounced || undefined, limit: 10, page: 1 }),
    enabled: open,
  });

  const list = results.data?.data ?? [];

  return (
    <div ref={wrapRef} className="relative">
      {label && <Label className="mb-1 block">{label}</Label>}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder={value ? value.name : placeholder}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
      </div>
      {value && !open && (
        <div className="mt-1 flex items-center justify-between rounded-md bg-muted px-2.5 py-1.5 text-sm">
          <span className="font-medium">{value.name}</span>
          <button type="button" className="text-xs text-muted-foreground underline" onClick={() => onSelect(null)}>
            Clear
          </button>
        </div>
      )}
      {open && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-background shadow-lg">
          {results.isLoading ? (
            <div className="p-3 text-sm text-muted-foreground">Searching…</div>
          ) : list.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">No products found.</div>
          ) : (
            list.map((p) => (
              <button
                key={p.id}
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-muted active:bg-muted"
                onClick={() => {
                  onSelect(p);
                  setSearch("");
                  setOpen(false);
                }}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{p.name}</div>
                  <div className="truncate font-mono text-xs text-muted-foreground">{p.sku}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-semibold">{inr(p.sellingPrice)}</div>
                  <div className="text-xs text-muted-foreground">Stock {p.currentStock}</div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
