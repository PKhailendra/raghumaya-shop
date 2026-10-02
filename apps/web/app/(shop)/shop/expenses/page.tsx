"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { expensesApi, ExpenseRecord, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Can, useShop } from "@/lib/shop-context";
import { inr } from "@/lib/format";
import { PageHeader, ErrorState, TableSkeleton } from "@/components/states";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";

const PAYMENT_MODES = ["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE"];

const CATEGORY_FILTER_OPTIONS = [
  { value: "", label: "All categories" },
  { value: "RENT", label: "Rent" },
  { value: "SALARY", label: "Salary" },
  { value: "UTILITIES", label: "Utilities" },
  { value: "SUPPLIES", label: "Supplies" },
  { value: "OTHER", label: "Other" },
];

const CATEGORY_FORM_OPTIONS = CATEGORY_FILTER_OPTIONS.filter((c) => c.value);

const PAYMENT_MODE_OPTIONS = PAYMENT_MODES.map((m) => ({ value: m, label: m }));

const CATEGORY_COLORS: Record<string, string> = {
  RENT: "secondary",
  SALARY: "secondary",
  UTILITIES: "secondary",
  SUPPLIES: "secondary",
  OTHER: "secondary",
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthStartStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface FormState {
  category: string;
  title: string;
  amount: string;
  expenseDate: string;
  paidBy: string;
  paymentMode: string;
  notes: string;
}

const emptyForm = (): FormState => ({
  category: "OTHER",
  title: "",
  amount: "",
  expenseDate: todayStr(),
  paidBy: "",
  paymentMode: "CASH",
  notes: "",
});

export default function ShopExpensesPage() {
  const { activeShopId } = useAuth();
  const { can } = useShop();
  const canView = can("FINANCE_VIEW");
  const canCreate = can("FINANCE_CREATE");
  const canUpdate = can("FINANCE_UPDATE");
  const canDelete = can("FINANCE_DELETE");
  const queryClient = useQueryClient();

  const [fromDate, setFromDate] = useState(monthStartStr());
  const [toDate, setToDate] = useState(todayStr());
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [monthStr, setMonthStr] = useState(currentMonth());

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseRecord | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteFor, setDeleteFor] = useState<ExpenseRecord | null>(null);

  const [year, month] = useMemo(() => {
    const [y, m] = monthStr.split("-").map(Number);
    if (!y || !m || m < 1 || m > 12) return [new Date().getFullYear(), new Date().getMonth() + 1];
    return [y, m];
  }, [monthStr]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["shop", "expenses"] });
    queryClient.invalidateQueries({ queryKey: ["shop", "expense-summary"] });
  };

  const listQuery = useQuery({
    queryKey: ["shop", "expenses", fromDate, toDate, category, search],
    queryFn: () =>
      expensesApi.list({
        page: 1,
        limit: 100,
        ...(fromDate ? { fromDate } : {}),
        ...(toDate ? { toDate } : {}),
        ...(category ? { category } : {}),
        ...(search.trim() ? { search: search.trim() } : {}),
      }),
    enabled: !!activeShopId && canView,
  });

  const summaryQuery = useQuery({
    queryKey: ["shop", "expense-summary", year, month],
    queryFn: () => expensesApi.summary({ year, month }),
    enabled: !!activeShopId && canView,
  });

  const rows: ExpenseRecord[] = listQuery.data?.data ?? [];
  const total = useMemo(() => rows.reduce((s, r) => s + Number(r.amount), 0), [rows]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = {
        category: form.category,
        title: form.title.trim(),
        amount: form.amount,
        expenseDate: form.expenseDate,
        ...(form.paidBy.trim() ? { paidBy: form.paidBy.trim() } : {}),
        ...(form.paymentMode ? { paymentMode: form.paymentMode } : {}),
        ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
      };
      return editing ? expensesApi.update(editing.id, body) : expensesApi.create(body);
    },
    onSuccess: () => {
      setFormOpen(false);
      setEditing(null);
      setFormError(null);
      invalidate();
    },
    onError: (e) => {
      setFormError(e instanceof ApiError ? e.message : "Could not save expense.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => expensesApi.remove(id),
    onSuccess: () => {
      setDeleteFor(null);
      invalidate();
    },
  });

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm());
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (r: ExpenseRecord) => {
    setEditing(r);
    setForm({
      category: r.category,
      title: r.title,
      amount: r.amount,
      expenseDate: r.expenseDate,
      paidBy: r.paidBy ?? "",
      paymentMode: r.paymentMode ?? "CASH",
      notes: r.notes ?? "",
    });
    setFormError(null);
    setFormOpen(true);
  };

  const submitForm = () => {
    if (!form.title.trim()) return setFormError("Description is required.");
    const amt = Number(form.amount);
    if (!Number.isFinite(amt) || amt < 0) return setFormError("Enter a valid amount (0 or more).");
    if (!form.expenseDate) return setFormError("Expense date is required.");
    if (form.expenseDate > todayStr()) return setFormError("Expense date cannot be in the future.");
    setFormError(null);
    saveMutation.mutate();
  };

  if (!canView) {
    return (
      <div>
        <PageHeader title="Expenses" description="Track shop expenses by category." />
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            You don't have permission to view expenses.
          </CardContent>
        </Card>
      </div>
    );
  }

  const summary = summaryQuery.data;

  return (
    <div>
      <PageHeader
        title="Expenses"
        description="Track shop expenses — rent, salary, utilities and more."
        actions={
          <Can any={["FINANCE_CREATE"]}>
            <Button onClick={openAdd}>+ Add expense</Button>
          </Can>
        }
      />

      {/* Monthly summary */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input type="month" value={monthStr} max={currentMonth()} onChange={(e) => setMonthStr(e.target.value)} className="w-40" />
        <span className="text-sm text-muted-foreground">
          {MONTHS[month - 1]} {year} summary
        </span>
      </div>
      {summaryQuery.isLoading ? (
        <TableSkeleton />
      ) : summary ? (
        <div className="mb-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Total</div>
              <div className="text-xl font-bold text-red-700">{inr(summary.grandTotal)}</div>
              <div className="text-xs text-muted-foreground">{summary.expenseCount} entries</div>
            </CardContent>
          </Card>
          {summary.breakdown.map((b) => (
            <Card key={b.category}>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">{b.categoryName}</div>
                <div className="text-xl font-bold">{inr(b.total)}</div>
                <div className="text-xs text-muted-foreground">{b.count} entries</div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {/* Filters */}
      <Card className="mb-4">
        <CardContent className="p-4 flex flex-wrap gap-2 items-end">
          <div>
            <Label>From</Label>
            <Input type="date" value={fromDate} max={todayStr()} onChange={(e) => setFromDate(e.target.value)} className="w-40" />
          </div>
          <div>
            <Label>To</Label>
            <Input type="date" value={toDate} max={todayStr()} onChange={(e) => setToDate(e.target.value)} className="w-40" />
          </div>
          <div>
            <Label>Category</Label>
            <Select value={category} onChange={setCategory} options={CATEGORY_FILTER_OPTIONS} className="w-40" />
          </div>
          <div className="flex-1 min-w-40">
            <Label>Search</Label>
            <Input placeholder="Search description…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {(fromDate || toDate || category || search) && (
            <Button
              variant="outline"
              onClick={() => { setFromDate(""); setToDate(""); setCategory(""); setSearch(""); }}
            >
              Clear
            </Button>
          )}
        </CardContent>
      </Card>

      {listQuery.isLoading ? (
        <TableSkeleton />
      ) : listQuery.isError ? (
        <ErrorState
          message={listQuery.error instanceof ApiError ? listQuery.error.message : "Could not load expenses."}
          onRetry={() => listQuery.refetch()}
        />
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No expenses found for the selected filters.
            {canCreate && (
              <div className="mt-3">
                <Button onClick={openAdd}>+ Add your first expense</Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Paid by</TableHead>
                  <TableHead>Mode</TableHead>
                  {(canUpdate || canDelete) && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{r.expenseDate}</TableCell>
                    <TableCell>
                      <div className="font-medium">{r.title}</div>
                      {r.notes && <div className="text-xs text-muted-foreground">{r.notes}</div>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={CATEGORY_COLORS[r.category] as "secondary"}>{r.categoryName}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-red-700">{inr(r.amount)}</TableCell>
                    <TableCell>{r.paidBy || "—"}</TableCell>
                    <TableCell>{r.paymentMode || "—"}</TableCell>
                    {(canUpdate || canDelete) && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {canUpdate && (
                            <Button size="sm" variant="outline" onClick={() => openEdit(r)}>Edit</Button>
                          )}
                          {canDelete && (
                            <Button size="sm" variant="outline" onClick={() => setDeleteFor(r)}>
                              Delete
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={3} className="font-semibold text-right">Total</TableCell>
                  <TableCell className="text-right font-bold text-red-700">{inr(total)}</TableCell>
                  <TableCell colSpan={(canUpdate || canDelete) ? 3 : 2} />
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Add/Edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit expense" : "Add expense"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Category *</Label>
              <Select value={form.category} onChange={(v) => setForm({ ...form, category: v })} options={CATEGORY_FORM_OPTIONS} />
            </div>
            <div>
              <Label>Description *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Shop rent for October" maxLength={200} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Amount (₹) *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>Date *</Label>
                <Input type="date" value={form.expenseDate} max={todayStr()} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Paid by</Label>
                <Input value={form.paidBy} onChange={(e) => setForm({ ...form, paidBy: e.target.value })} placeholder="e.g. Owner" maxLength={200} />
              </div>
              <div>
                <Label>Payment mode</Label>
                <Select value={form.paymentMode} onChange={(v) => setForm({ ...form, paymentMode: v })} options={PAYMENT_MODE_OPTIONS} />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional note" maxLength={1000} />
            </div>
            {formError && <div className="text-sm text-red-600">{formError}</div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={submitForm} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving…" : editing ? "Save changes" : "Add expense"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteFor}
        onOpenChange={(v) => !v && setDeleteFor(null)}
        title="Delete expense?"
        description={deleteFor ? `Delete "${deleteFor.title}" (${inr(deleteFor.amount)})? This cannot be undone.` : undefined}
        confirmLabel="Delete"
        destructive
        busy={deleteMutation.isPending}
        onConfirm={() => { if (deleteFor) deleteMutation.mutate(deleteFor.id); }}
      />
    </div>
  );
}
