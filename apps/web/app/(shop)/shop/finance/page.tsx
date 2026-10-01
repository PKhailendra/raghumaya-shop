"use client";

import type React from "react";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { financeApi, ApiError, type FinanceEntry, type FinanceCategory } from "@/lib/api";
import { formatDateTime, inr, toTitle } from "@/lib/format";
import { PageHeader, ErrorState, EmptyState, TableSkeleton } from "@/components/states";
import { StatCard } from "@/components/stat-card";
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
import { SimpleLineChart } from "@/components/charts";
import { Can } from "@/lib/shop-context";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";

type EntryKind = "revenues" | "expenses" | "assets" | "liabilities";

const KIND_META: Record<EntryKind, { title: string; singular: string }> = {
  revenues: { title: "Revenues", singular: "Revenue" },
  expenses: { title: "Expenses", singular: "Expense" },
  assets: { title: "Assets", singular: "Asset" },
  liabilities: { title: "Liabilities", singular: "Liability" },
};

export default function ShopFinancePage() {
  const [tab, setTab] = useState<EntryKind>("revenues");
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<{ entry?: FinanceEntry } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FinanceEntry | null>(null);
  const queryClient = useQueryClient();

  const dashboard = useQuery({ queryKey: ["shop", "finance", "dashboard"], queryFn: () => financeApi.dashboard() });
  const cashFlow = useQuery({ queryKey: ["shop", "finance", "cash-flow"], queryFn: () => financeApi.cashFlow() });
  const profitLoss = useQuery({ queryKey: ["shop", "finance", "profit-loss"], queryFn: () => financeApi.profitLoss() });
  const tax = useQuery({ queryKey: ["shop", "finance", "tax"], queryFn: () => financeApi.taxReport() });

  const entries = useQuery({
    queryKey: ["shop", "finance", tab, page],
    queryFn: () => financeApi[tab]({ page, limit: 20 }),
  });
  const categories = useQuery({
    queryKey: ["shop", "finance", "categories"],
    queryFn: () => financeApi.categories(),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["shop", "finance"] });
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    if (tab === "revenues") await financeApi.deleteRevenue(deleteTarget.id);
    if (tab === "expenses") await financeApi.deleteExpense(deleteTarget.id);
    if (tab === "assets") await financeApi.deleteAsset(deleteTarget.id);
    if (tab === "liabilities") await financeApi.deleteLiability(deleteTarget.id);
    invalidate();
  };

  const d = (dashboard.data ?? {}) as Record<string, unknown>;
  const money = (v: unknown) => inr(typeof v === "string" || typeof v === "number" ? v : 0);
  const rows = (entries.data?.data ?? []) as FinanceEntry[];
  const catList = toList<FinanceCategory>(categories.data);
  const cashFlowData = (cashFlow.data ?? []) as unknown[];

  return (
    <div>
      <PageHeader title="Finance" description="Track money in, money out, assets and liabilities." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard title="Total revenue" value={money(d.totalRevenue)} loading={dashboard.isLoading} />
        <StatCard title="Total expenses" value={money(d.totalExpenses)} loading={dashboard.isLoading} />
        <StatCard title="Net profit" value={money(d.netProfit)} loading={dashboard.isLoading} />
        <StatCard title="Cash balance" value={money(d.cashBalance)} loading={dashboard.isLoading} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Cash flow</CardTitle>
          </CardHeader>
          <CardContent>
            {cashFlow.isLoading ? (
              <div className="h-[280px] animate-pulse rounded-md bg-muted" />
            ) : cashFlowData.length === 0 ? (
              <EmptyState title="No cash-flow data" />
            ) : (
              <SimpleLineChart
                data={cashFlowData}
                xKey="date"
                lines={[
                  { key: "inflow", name: "Inflow" },
                  { key: "outflow", name: "Outflow", color: "#ef4444" },
                ]}
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Profit & loss</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            {profitLoss.isLoading ? (
              <div className="h-24 animate-pulse rounded-md bg-muted" />
            ) : (
              <PlRows data={profitLoss.data ?? {}} />
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={(v) => { setTab(v as EntryKind); setPage(1); }}>
        <div className="flex items-center justify-between mb-3">
          <TabsList>
            {(Object.keys(KIND_META) as EntryKind[]).map((k) => (
              <TabsTrigger key={k} value={k}>{KIND_META[k].title}</TabsTrigger>
            ))}
          </TabsList>
          <Can any={["FINANCE_CREATE"]}>
            <Button size="sm" onClick={() => setEditor({})}>
              <Plus className="h-4 w-4" /> Add {KIND_META[tab].singular.toLowerCase()}
            </Button>
          </Can>
        </div>

        {(Object.keys(KIND_META) as EntryKind[]).map((k) => (
          <TabsContent key={k} value={k}>
            {entries.isLoading && tab === k ? (
              <TableSkeleton />
            ) : entries.isError && tab === k ? (
              <ErrorState
                message={entries.error instanceof ApiError ? entries.error.message : "Could not load entries."}
                onRetry={() => entries.refetch()}
              />
            ) : rows.length === 0 ? (
              <EmptyState title={`No ${KIND_META[k].title.toLowerCase()} yet`} />
            ) : (
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Description</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="font-medium">{e.description ?? "-"}</TableCell>
                          <TableCell>{e.categoryName ? <Badge variant="secondary">{e.categoryName}</Badge> : "-"}</TableCell>
                          <TableCell>{formatDateTime(e.date)}</TableCell>
                          <TableCell className="text-right font-medium">{inr(e.amount)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="outline" onClick={() => setEditor({ entry: e })}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(e)}>
                                <Trash2 className="h-3.5 w-3.5" />
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
            <Pagination page={page} limit={20} total={entries.data?.meta.total ?? 0} onPageChange={setPage} />
          </TabsContent>
        ))}
      </Tabs>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Tax report</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          {tax.isLoading ? (
            <div className="h-24 animate-pulse rounded-md bg-muted" />
          ) : (
            <PlRows data={tax.data ?? {}} />
          )}
        </CardContent>
      </Card>

      {editor && (
        <EntryEditor
          kind={tab}
          entry={editor.entry}
          categories={catList}
          onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); invalidate(); }}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title={`Delete ${KIND_META[tab].singular.toLowerCase()}`}
        description="This entry will be removed. This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={doDelete}
      />
    </div>
  );
}

function toList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  return ((data as { data?: T[] })?.data ?? []) as T[];
}

function PlRows({ data }: { data: Record<string, unknown> }) {
  const all: [string, unknown][] = [
    ["Total revenue", data.totalRevenue],
    ["Total expenses", data.totalExpenses],
    ["Net profit", data.netProfit],
    ["GST collected", data.gstCollected],
    ["GST paid", data.gstPaid],
    ["Tax payable", data.taxPayable],
  ];
  const rows = all.filter(([, v]) => v !== undefined);
  if (rows.length === 0) return <div className="text-sm text-muted-foreground">No data for this period.</div>;
  return (
    <div>
      {rows.map(([label, v]) => (
        <div key={label} className="flex justify-between border-b py-2 last:border-0">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-medium">{inr(typeof v === "string" || typeof v === "number" ? v : 0)}</span>
        </div>
      ))}
    </div>
  );
}

function EntryEditor({
  kind,
  entry,
  categories,
  onClose,
  onSaved,
}: {
  kind: EntryKind;
  entry?: FinanceEntry;
  categories: FinanceCategory[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [description, setDescription] = useState(entry?.description ?? "");
  const [amount, setAmount] = useState(entry?.amount ?? "");
  const [categoryId, setCategoryId] = useState(entry?.categoryId ?? "");
  const [date, setDate] = useState((entry?.date ?? new Date().toISOString()).slice(0, 10));
  const [paymentMode, setPaymentMode] = useState(entry?.paymentMode ?? "CASH");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const dateLabel = kind === "assets" ? "Purchase date" : kind === "liabilities" ? "Due date" : "Date";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!description.trim()) return setError("Description is required.");
    if (!amount || Number(amount) <= 0) return setError("Enter a valid amount.");
    setBusy(true);
    try {
      const body = {
        description: description.trim(),
        amount: String(amount),
        categoryId: categoryId || undefined,
        date,
        paymentMode,
      };
      if (entry) {
        if (kind === "revenues") await financeApi.updateRevenue(entry.id, body);
        if (kind === "expenses") await financeApi.updateExpense(entry.id, body);
        if (kind === "assets") await financeApi.updateAsset(entry.id, body);
        if (kind === "liabilities") await financeApi.updateLiability(entry.id, body);
      } else {
        if (kind === "revenues") await financeApi.createRevenue(body);
        if (kind === "expenses") await financeApi.createExpense(body);
        if (kind === "assets") await financeApi.createAsset(body);
        if (kind === "liabilities") await financeApi.createLiability(body);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the entry.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{entry ? "Edit" : "Add"} {KIND_META[kind].singular.toLowerCase()}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="text-sm text-destructive">{error}</div>}
          <div className="space-y-2">
            <Label htmlFor="f-desc">Description *</Label>
            <Input id="f-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="f-amount">Amount *</Label>
              <Input id="f-amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="f-date">{dateLabel}</Label>
              <Input id="f-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {(kind === "revenues" || kind === "expenses") && (
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={categoryId}
                  onChange={setCategoryId}
                  placeholder="No category"
                  options={[{ value: "", label: "No category" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
                />
              </div>
            )}
            {kind === "expenses" && (
              <div className="space-y-2">
                <Label>Mode</Label>
                <Select value={paymentMode} onChange={setPaymentMode} options={["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE"].map((m) => ({ value: m, label: toTitle(m) }))} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
