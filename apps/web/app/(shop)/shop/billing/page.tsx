"use client";

import type React from "react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  billingApi,
  customersApi,
  inventoryApi,
  ApiError,
  type Invoice,
  type Customer,
  type Product,
} from "@/lib/api";
import { formatDateTime, inr, toTitle } from "@/lib/format";
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
import { Separator } from "@/components/ui/separator";
import { Can } from "@/lib/shop-context";
import { Plus, FileText, Share2, MessageCircle, Download, Trash2, IndianRupee } from "lucide-react";
import { BarcodeScanner } from "@/components/barcode-scanner";

const STATUS_VARIANTS: Record<string, "success" | "warning" | "destructive" | "info" | "secondary"> = {
  DRAFT: "secondary",
  ISSUED: "info",
  PARTIALLY_PAID: "warning",
  PAID: "success",
  OVERDUE: "destructive",
  CANCELLED: "secondary",
};

export default function ShopBillingPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [builderOpen, setBuilderOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const queryClient = useQueryClient();

  const invoices = useQuery({
    queryKey: ["shop", "invoices", page, status],
    queryFn: () => billingApi.invoices({ page, limit: 20, status: status || undefined }),
  });
  const payments = useQuery({
    queryKey: ["shop", "payments"],
    queryFn: () => billingApi.payments({ page: 1, limit: 50 }),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["shop", "invoices"] });
    queryClient.invalidateQueries({ queryKey: ["shop", "payments"] });
  };

  const rows = invoices.data?.data ?? [];

  return (
    <div>
      <PageHeader
        title="Billing"
        description="Invoices and payments."
        actions={
          <Can any={["INVOICE_CREATE"]}>
            <Button onClick={() => setBuilderOpen(true)}>
              <Plus className="h-4 w-4" /> New invoice
            </Button>
          </Can>
        }
      />

      <Tabs defaultValue="invoices">
        <TabsList>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
        </TabsList>

        <TabsContent value="invoices">
          <div className="mb-4 max-w-xs">
            <Select
              value={status}
              onChange={(v) => { setStatus(v); setPage(1); }}
              placeholder="All statuses"
              options={[
                { value: "", label: "All statuses" },
                { value: "DRAFT", label: "Draft" },
                { value: "ISSUED", label: "Issued" },
                { value: "PARTIALLY_PAID", label: "Partially paid" },
                { value: "PAID", label: "Paid" },
                { value: "OVERDUE", label: "Overdue" },
                { value: "CANCELLED", label: "Cancelled" },
              ]}
            />
          </div>

          {invoices.isLoading ? (
            <TableSkeleton />
          ) : invoices.isError ? (
            <ErrorState
              message={invoices.error instanceof ApiError ? invoices.error.message : "Could not load invoices."}
              onRetry={() => invoices.refetch()}
            />
          ) : rows.length === 0 ? (
            <EmptyState
              title="No invoices yet"
              description="Create your first invoice."
              action={
                <Can any={["INVOICE_CREATE"]}>
                  <Button onClick={() => setBuilderOpen(true)}><Plus className="h-4 w-4" /> New invoice</Button>
                </Can>
              }
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice no.</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((inv) => (
                      <TableRow key={inv.id} className="cursor-pointer" onClick={() => setSelectedInvoice(inv)}>
                        <TableCell className="font-mono text-xs">{inv.invoiceNumber}</TableCell>
                        <TableCell>{inv.customerName ?? <span className="text-muted-foreground">Walk-in</span>}</TableCell>
                        <TableCell>{formatDateTime(inv.invoiceDate)}</TableCell>
                        <TableCell className="text-right">{inr(inv.grandTotal)}</TableCell>
                        <TableCell className="text-right">{inr(inv.balanceAmount)}</TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANTS[inv.status] ?? "secondary"}>{toTitle(inv.status)}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
          <Pagination page={page} limit={20} total={invoices.data?.meta.total ?? 0} onPageChange={setPage} />
        </TabsContent>

        <TabsContent value="payments">
          {payments.isLoading ? (
            <TableSkeleton />
          ) : payments.isError ? (
            <ErrorState
              message={payments.error instanceof ApiError ? payments.error.message : "Could not load payments."}
              onRetry={() => payments.refetch()}
            />
          ) : (payments.data?.data ?? []).length === 0 ? (
            <EmptyState title="No payments recorded" />
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead>Direction</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Reference</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(payments.data?.data ?? []).map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>{formatDateTime(p.paymentDate)}</TableCell>
                        <TableCell><Badge variant="secondary">{toTitle(p.mode)}</Badge></TableCell>
                        <TableCell>{toTitle(p.direction)}</TableCell>
                        <TableCell className="text-right font-medium">{inr(p.amount)}</TableCell>
                        <TableCell className="text-xs">{p.referenceNumber ?? "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {builderOpen && (
        <InvoiceBuilder onClose={() => setBuilderOpen(false)} onDone={() => { setBuilderOpen(false); invalidate(); }} />
      )}
      {selectedInvoice && (
        <InvoiceDetail
          invoice={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          onChanged={() => { invalidate(); }}
        />
      )}
    </div>
  );
}

// ---------- Invoice builder with GST auto-math ----------
type LineItem = { productId: string; description: string; quantity: number; unitPrice: string; discountRate: string; gstRate: string };

function lineTotals(l: LineItem, interState: boolean) {
  const gross = Number(l.quantity || 0) * Number(l.unitPrice || 0);
  const discount = (gross * Number(l.discountRate || 0)) / 100;
  const taxable = gross - discount;
  const gst = (taxable * Number(l.gstRate || 0)) / 100;
  return { gross, discount, taxable, gst, cgst: interState ? 0 : gst / 2, sgst: interState ? 0 : gst / 2, igst: interState ? gst : 0 };
}

function InvoiceBuilder({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [customerId, setCustomerId] = useState("");
  const [interState, setInterState] = useState(false);
  const [items, setItems] = useState<LineItem[]>([
    { productId: "", description: "", quantity: 1, unitPrice: "", discountRate: "0", gstRate: "18" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const customers = useQuery({ queryKey: ["shop", "customers", "all"], queryFn: () => customersApi.list({ page: 1, limit: 100 }) });
  const products = useQuery({ queryKey: ["shop", "products", "all"], queryFn: () => inventoryApi.products({ page: 1, limit: 100 }) });

  const updateItem = (i: number, patch: Partial<LineItem>) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  const pickProduct = (i: number, productId: string) => {
    const p = ((products.data?.data ?? []) as Product[]).find((x) => x.id === productId);
    updateItem(i, {
      productId,
      description: p?.name ?? "",
      unitPrice: p?.sellingPrice ?? "",
      gstRate: p?.gstRate ?? "18",
    });
  };

  const computed = items.map((l) => lineTotals(l, interState));
  const subtotal = computed.reduce((s, c) => s + c.taxable, 0);
  const gstTotal = computed.reduce((s, c) => s + c.gst, 0);
  const discountTotal = computed.reduce((s, c) => s + c.discount, 0);
  const grandTotal = subtotal + gstTotal;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const valid = items.filter((it) => it.description.trim() && Number(it.quantity) > 0 && Number(it.unitPrice) >= 0);
    if (valid.length === 0) return setError("Add at least one valid line item.");
    setBusy(true);
    try {
      await billingApi.createInvoice({
        customerId: customerId || undefined,
        interState,
        items: valid.map((it) => ({
          productId: it.productId || undefined,
          description: it.description.trim(),
          quantity: Number(it.quantity),
          unitPrice: String(it.unitPrice),
          discountRate: it.discountRate,
          gstRate: it.gstRate,
        })),
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the invoice.");
    } finally {
      setBusy(false);
    }
  };

  const customerList = (customers.data?.data ?? []) as Customer[];
  const productList = (products.data?.data ?? []) as Product[];

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>New invoice</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="text-sm text-destructive">{error}</div>}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Customer</Label>
              <Select
                value={customerId}
                onChange={setCustomerId}
                placeholder="Walk-in customer"
                options={[{ value: "", label: "Walk-in customer" }, ...customerList.map((c) => ({ value: c.id, label: c.name }))]}
              />
            </div>
            <div className="space-y-2">
              <Label>Sale type</Label>
              <Select
                value={interState ? "inter" : "intra"}
                onChange={(v) => setInterState(v === "inter")}
                options={[
                  { value: "intra", label: "Within state (CGST + SGST)" },
                  { value: "inter", label: "Other state (IGST)" },
                ]}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Line items</Label>
              <BarcodeScanner
                buttonLabel="Scan item"
                onScan={async (code) => {
                  try {
                    const p = await inventoryApi.lookup("barcode", code);
                    setItems((prev) => [
                      ...prev,
                      {
                        productId: p.id,
                        description: p.name,
                        quantity: 1,
                        unitPrice: p.sellingPrice,
                        discountRate: "0",
                        gstRate: p.gstRate ?? "18",
                      },
                    ]);
                  } catch {
                    setError(`No product found for barcode ${code}.`);
                  }
                }}
              />
            </div>
            {items.map((it, i) => (
              <div key={i} className="rounded-md border p-3 space-y-2">
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-12 sm:col-span-5">
                    <Select
                      value={it.productId}
                      onChange={(v) => pickProduct(i, v)}
                      placeholder="Select product"
                      options={[{ value: "", label: "Custom item" }, ...productList.map((p) => ({ value: p.id, label: p.name }))]}
                    />
                  </div>
                  <Input className="col-span-6 sm:col-span-3" placeholder="Description" value={it.description} onChange={(e) => updateItem(i, { description: e.target.value })} />
                  <Input className="col-span-2 sm:col-span-1" type="number" min="1" placeholder="Qty" value={it.quantity} onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })} />
                  <Input className="col-span-3 sm:col-span-2" type="number" min="0" step="0.01" placeholder="Price" value={it.unitPrice} onChange={(e) => updateItem(i, { unitPrice: e.target.value })} />
                  <Button type="button" size="icon" variant="ghost" className="col-span-1" onClick={() => setItems((p) => p.filter((_, idx) => idx !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Discount %</Label>
                    <Input type="number" min="0" max="100" step="0.01" value={it.discountRate} onChange={(e) => updateItem(i, { discountRate: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">GST %</Label>
                    <Select value={it.gstRate} onChange={(v) => updateItem(i, { gstRate: v })} options={["0", "5", "12", "18", "28"].map((g) => ({ value: g, label: `${g}%` }))} />
                  </div>
                  <div className="text-right text-xs text-muted-foreground self-end">
                    Line total: <span className="font-semibold text-foreground">{inr(computed[i].taxable + computed[i].gst)}</span>
                  </div>
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setItems((p) => [...p, { productId: "", description: "", quantity: 1, unitPrice: "", discountRate: "0", gstRate: "18" }])}
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Add item
            </Button>
          </div>

          <Card>
            <CardContent className="p-4 text-sm space-y-1">
              <div className="flex justify-between"><span>Subtotal</span><span>{inr(subtotal)}</span></div>
              <div className="flex justify-between"><span>Discount</span><span>- {inr(discountTotal)}</span></div>
              {interState ? (
                <div className="flex justify-between"><span>IGST</span><span>{inr(gstTotal)}</span></div>
              ) : (
                <>
                  <div className="flex justify-between"><span>CGST</span><span>{inr(gstTotal / 2)}</span></div>
                  <div className="flex justify-between"><span>SGST</span><span>{inr(gstTotal / 2)}</span></div>
                </>
              )}
              <Separator className="my-2" />
              <div className="flex justify-between font-bold text-base"><span>Grand total</span><span>{inr(grandTotal)}</span></div>
            </CardContent>
          </Card>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create invoice"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Invoice detail: PDF, share, WhatsApp, payments ----------
function InvoiceDetail({ invoice, onClose, onChanged }: { invoice: Invoice; onClose: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);

  const detail = useQuery({
    queryKey: ["shop", "invoice", invoice.id],
    queryFn: () => billingApi.getInvoice(invoice.id),
  });

  const inv = detail.data ?? invoice;

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setError(null);
    try {
      const res = await fn();
      return res;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed.");
      return null;
    } finally {
      setBusy(null);
    }
  };

  const downloadPdf = async () => {
    const res = await run("pdf", () => billingApi.pdf(inv.id)) as { pdfBase64?: string; url?: string } | null;
    if (!res) return;
    if (res.pdfBase64) {
      const bytes = Uint8Array.from(atob(res.pdfBase64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${inv.invoiceNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } else if (res.url) {
      window.open(res.url, "_blank");
    }
  };

  const openShare = async () => {
    const res = await run("share", () => billingApi.share(inv.id)) as { shareUrl?: string } | null;
    if (res?.shareUrl) {
      await navigator.clipboard.writeText(res.shareUrl).catch(() => {});
      window.open(res.shareUrl, "_blank");
    }
  };

  const openWhatsapp = async () => {
    const phone = prompt("Customer phone number for WhatsApp:");
    if (!phone) return;
    const res = await run("whatsapp", () => billingApi.whatsappLink(inv.id, { phone })) as { whatsappUrl?: string } | null;
    if (res?.whatsappUrl) window.open(res.whatsappUrl, "_blank");
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> {inv.invoiceNumber}
          </DialogTitle>
        </DialogHeader>

        {error && <div className="text-sm text-destructive">{error}</div>}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={downloadPdf} disabled={!!busy}>
            <Download className="h-3.5 w-3.5 mr-1" /> {busy === "pdf" ? "Preparing…" : "Download PDF"}
          </Button>
          <Button size="sm" variant="outline" onClick={openShare} disabled={!!busy}>
            <Share2 className="h-3.5 w-3.5 mr-1" /> {busy === "share" ? "Preparing…" : "Share link"}
          </Button>
          <Button size="sm" variant="outline" onClick={openWhatsapp} disabled={!!busy}>
            <MessageCircle className="h-3.5 w-3.5 mr-1" /> {busy === "whatsapp" ? "Preparing…" : "WhatsApp"}
          </Button>
          <Can any={["PAYMENT_CREATE"]}>
            <Button size="sm" onClick={() => setPayOpen(true)}>
              <IndianRupee className="h-3.5 w-3.5 mr-1" /> Record payment
            </Button>
          </Can>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><span className="text-muted-foreground">Customer:</span> <span className="font-medium">{inv.customerName ?? "Walk-in"}</span></div>
          <div><span className="text-muted-foreground">Date:</span> {formatDateTime(inv.invoiceDate)}</div>
          <div><span className="text-muted-foreground">Status:</span> <Badge variant={STATUS_VARIANTS[inv.status] ?? "secondary"}>{toTitle(inv.status)}</Badge></div>
          <div><span className="text-muted-foreground">Balance:</span> <span className="font-semibold">{inr(inv.balanceAmount)}</span></div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Items</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">GST</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(inv.items ?? []).map((it, i) => (
                  <TableRow key={i}>
                    <TableCell>{it.description}</TableCell>
                    <TableCell className="text-right">{it.quantity}</TableCell>
                    <TableCell className="text-right">{inr(it.unitPrice)}</TableCell>
                    <TableCell className="text-right">{it.gstRate ?? 0}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="text-sm space-y-1">
          <div className="flex justify-between"><span>Subtotal</span><span>{inr(inv.subtotal)}</span></div>
          <div className="flex justify-between"><span>GST</span><span>{inr(inv.gstTotal)}</span></div>
          <div className="flex justify-between font-bold"><span>Grand total</span><span>{inr(inv.grandTotal)}</span></div>
          <div className="flex justify-between"><span>Paid</span><span>{inr(inv.paidAmount)}</span></div>
        </div>

        {payOpen && (
          <PaymentDialog
            invoice={inv}
            onClose={() => setPayOpen(false)}
            onDone={() => { setPayOpen(false); onChanged(); detail.refetch(); }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PaymentDialog({ invoice, onClose, onDone }: { invoice: Invoice; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState(invoice.balanceAmount ?? "");
  const [mode, setMode] = useState("CASH");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!amount || Number(amount) <= 0) return setError("Enter a valid amount.");
    setBusy(true);
    try {
      await billingApi.recordPayment({
        invoiceId: invoice.id,
        amount,
        mode,
        direction: "IN",
        referenceNumber: referenceNumber.trim() || undefined,
        notes: notes.trim() || undefined,
        paymentDate: new Date().toISOString(),
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not record the payment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Record payment — {invoice.invoiceNumber}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="text-sm text-destructive">{error}</div>}
          <div className="space-y-2">
            <Label htmlFor="pay-amount">Amount *</Label>
            <Input id="pay-amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Payment mode</Label>
            <Select value={mode} onChange={setMode} options={["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE"].map((m) => ({ value: m, label: toTitle(m) }))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pay-ref">Reference number</Label>
            <Input id="pay-ref" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pay-notes">Notes</Label>
            <Input id="pay-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Record payment"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
