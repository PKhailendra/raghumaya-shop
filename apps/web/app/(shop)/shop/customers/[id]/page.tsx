"use client";

import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { billingApi, customersApi, shopsApi, ApiError, type LedgerEntry } from "@/lib/api";
import { formatDate, formatDateTime, inr, toTitle } from "@/lib/format";
import { PageHeader, ErrorState, EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Send, MessageCircle, Trash2, IndianRupee } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Can } from "@/lib/shop-context";

const PAYMENT_MODES = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "CARD", label: "Card" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "CHEQUE", label: "Cheque" },
];

export default function ShopCustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [note, setNote] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const customer = useQuery({ queryKey: ["shop", "customer", id], queryFn: () => customersApi.get(id) });
  const shopCtx = useQuery({ queryKey: ["shop", "context"], queryFn: () => shopsApi.context() });
  const ledger = useQuery({
    queryKey: ["shop", "customer", id, "ledger", fromDate, toDate],
    queryFn: () => customersApi.ledger(id, { fromDate: fromDate || undefined, toDate: toDate || undefined }),
  });
  const purchases = useQuery({ queryKey: ["shop", "customer", id, "purchases"], queryFn: () => customersApi.purchases(id, { page: 1, limit: 20 }) });

  const remind = useMutation({
    mutationFn: (kind: "sms" | "whatsapp") =>
      kind === "sms" ? customersApi.sendSmsReminder(id) : customersApi.sendWhatsappReminder(id),
    onSuccess: (_, kind) => setNote(`Reminder sent via ${kind === "sms" ? "SMS" : "WhatsApp"}.`),
    onError: (err) => setNote(err instanceof ApiError ? err.message : "Could not send the reminder."),
  });

  const remove = useMutation({
    mutationFn: () => customersApi.remove(id),
    onSuccess: () => router.replace("/shop/customers"),
    onError: (err) => setNote(err instanceof ApiError ? err.message : "Could not delete the customer."),
  });

  if (customer.isLoading) {
    return (
      <div>
        <PageHeader title="Customer" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (customer.isError || !customer.data) {
    return (
      <div>
        <PageHeader title="Customer" />
        <ErrorState
          message={customer.error instanceof ApiError ? customer.error.message : "Could not load this customer."}
          onRetry={() => customer.refetch()}
        />
      </div>
    );
  }

  const c = customer.data;
  const ledgerRows = (ledger.data ?? []) as LedgerEntry[];
  const purchaseRows = (purchases.data?.data ?? []) as { grandTotal?: string | number }[];
  const totalPurchases = purchaseRows.reduce((s, p) => s + (typeof p.grandTotal === "string" || typeof p.grandTotal === "number" ? Number(p.grandTotal) : 0), 0);
  const due = Number(c.balance ?? 0);

  const shopName = shopCtx.data?.shop?.name ?? "hamari dukaan";
  const waHref = buildWhatsAppHref(c.phone, `Namaste ${c.name}, aapke ${shopName} me ${inr(due)} baki hain. Kripya jald bhugtaan karein. Dhanyavaad!`);

  const refreshKhata = () => {
    queryClient.invalidateQueries({ queryKey: ["shop", "customer", id] });
    queryClient.invalidateQueries({ queryKey: ["shop", "customer", id, "ledger"] });
  };

  return (
    <div>
      <PageHeader
        title={c.name}
        description={`${c.phone ?? ""} ${c.email ? `· ${c.email}` : ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Can any={["PAYMENT_CREATE"]}>
              <Button size="sm" onClick={() => setPayOpen(true)} disabled={due <= 0}>
                <IndianRupee className="h-3.5 w-3.5 mr-1" /> Payment received
              </Button>
            </Can>
            <Button size="sm" variant="outline" onClick={() => remind.mutate("sms")} disabled={remind.isPending}>
              <Send className="h-3.5 w-3.5 mr-1" /> SMS reminder
            </Button>
            {waHref ? (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <MessageCircle className="h-3.5 w-3.5 mr-1" /> WhatsApp
              </a>
            ) : (
              <Button size="sm" variant="outline" onClick={() => remind.mutate("whatsapp")} disabled={remind.isPending}>
                <MessageCircle className="h-3.5 w-3.5 mr-1" /> WhatsApp reminder
              </Button>
            )}
            <Can any={["CUSTOMER_DELETE"]}>
              <Button size="sm" variant="destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
              </Button>
            </Can>
          </div>
        }
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete customer?"
        description={`This will permanently delete ${c.name}. Customers with invoices cannot be deleted.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => remove.mutate()}
        busy={remove.isPending}
      />

      {payOpen && (
        <PaymentReceivedDialog
          customerId={id}
          name={c.name}
          due={due}
          onClose={() => setPayOpen(false)}
          onDone={(msg) => {
            setPayOpen(false);
            setNote(msg);
            refreshKhata();
          }}
        />
      )}

      {note && <div className="mb-4 rounded-md border p-3 text-sm">{note}</div>}

      {/* Total due — prominent */}
      <Card className={`mb-6 border-2 ${due > 0 ? "border-destructive/60 bg-destructive/5" : "border-green-600/40 bg-green-50 dark:bg-green-950/20"}`}>
        <CardContent className="p-5 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-muted-foreground">Kul baki (Total due)</div>
            <div className={`text-3xl font-bold ${due > 0 ? "text-destructive" : "text-green-700 dark:text-green-400"}`}>
              {inr(due)}
            </div>
            {c.creditLimit && Number(c.creditLimit) > 0 && (
              <div className="text-xs text-muted-foreground mt-1">Credit limit: {inr(c.creditLimit)}</div>
            )}
          </div>
          <div className="text-right">
            <div className="text-sm text-muted-foreground">Total purchases</div>
            <div className="text-xl font-semibold">{inr(totalPurchases)}</div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="ledger">
        <TabsList>
          <TabsTrigger value="ledger">Khata book</TabsTrigger>
          <TabsTrigger value="purchases">Purchases</TabsTrigger>
          <TabsTrigger value="info">Info</TabsTrigger>
        </TabsList>

        <TabsContent value="ledger">
          <div className="flex flex-wrap items-end gap-3 mb-3">
            <div className="space-y-1">
              <Label htmlFor="khata-from">From</Label>
              <Input id="khata-from" type="date" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="khata-to">To</Label>
              <Input id="khata-to" type="date" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} className="w-40" />
            </div>
            {(fromDate || toDate) && (
              <Button size="sm" variant="ghost" onClick={() => { setFromDate(""); setToDate(""); }}>
                Clear
              </Button>
            )}
          </div>
          {ledger.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : ledger.isError ? (
            <ErrorState
              message={ledger.error instanceof ApiError ? ledger.error.message : "Could not load the ledger."}
              onRetry={() => ledger.refetch()}
            />
          ) : ledgerRows.length === 0 ? (
            <EmptyState title="No khata entries" description="No invoices or payments in this period." />
          ) : (
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Debit (udhaar)</TableHead>
                      <TableHead className="text-right">Credit (payment)</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledgerRows.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="whitespace-nowrap text-xs">{formatDate(e.date)}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="mr-2">{toTitle(e.type)}</Badge>
                          <span className="text-xs font-mono">{e.reference}</span>
                        </TableCell>
                        <TableCell className="text-right text-destructive font-medium">
                          {Number(e.debit) > 0 ? inr(e.debit) : "-"}
                        </TableCell>
                        <TableCell className="text-right text-green-700 dark:text-green-400 font-medium">
                          {Number(e.credit) > 0 ? inr(e.credit) : "-"}
                        </TableCell>
                        <TableCell className="text-right font-semibold">{inr(e.runningBalance)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="purchases">
          {(purchases.data?.data ?? []).length === 0 ? (
            <EmptyState title="No purchases" />
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(purchases.data?.data ?? []).map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-xs">{p.invoiceNumber}</TableCell>
                        <TableCell>{formatDateTime(p.invoiceDate)}</TableCell>
                        <TableCell className="text-right">{inr(p.grandTotal)}</TableCell>
                        <TableCell><Badge variant="secondary">{toTitle(p.status)}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="info">
          <Card>
            <CardHeader>
              <CardTitle>Customer information</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 sm:grid-cols-2 text-sm">
                <InfoRow label="Name" value={c.name} />
                <InfoRow label="Phone" value={c.phone ?? "-"} />
                <InfoRow label="Email" value={c.email ?? "-"} />
                <InfoRow label="GST number" value={c.gstNumber ?? "-"} />
                <InfoRow label="Address" value={c.address ?? "-"} />
                <InfoRow label="Customer since" value={formatDateTime(c.createdAt)} />
              </dl>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function buildWhatsAppHref(phone: string | undefined, message: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  const normalized = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

function PaymentReceivedDialog({ customerId, name, due, onClose, onDone }: {
  customerId: string;
  name: string;
  due: number;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [amount, setAmount] = useState(due > 0 ? String(due) : "");
  const [mode, setMode] = useState("CASH");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!amount || isNaN(amt) || amt <= 0) return setError("Amount must be greater than zero.");
    if (amt > due) return setError(`Amount cannot exceed the due of ${inr(due)}.`);
    if (!date) return setError("Please pick a date.");
    if (date > today) return setError("Payment date cannot be in the future.");
    setBusy(true);
    try {
      await billingApi.recordPayment({
        customerId,
        amount: amt,
        mode,
        direction: "IN",
        paymentDate: date,
        notes: notes || undefined,
      });
      onDone(`Payment of ${inr(amt)} received from ${name}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not record the payment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Payment received — {name}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="text-sm text-destructive">{error}</div>}
          <div className="rounded-md bg-muted p-3 text-sm">
            Total due: <span className="font-semibold">{inr(due)}</span>
          </div>
          <div className="space-y-2">
            <Label htmlFor="khata-amount">Amount received (₹)</Label>
            <Input id="khata-amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="khata-mode">Mode</Label>
              <Select value={mode} onChange={setMode} options={PAYMENT_MODES} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="khata-date">Date</Label>
              <Input id="khata-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="khata-notes">Notes</Label>
            <Input id="khata-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Saving..." : "Record payment"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
