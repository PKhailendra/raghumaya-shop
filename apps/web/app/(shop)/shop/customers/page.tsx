"use client";

import type React from "react";
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customersApi, ApiError, type Customer } from "@/lib/api";
import { inr, toTitle } from "@/lib/format";
import { PageHeader, ErrorState, EmptyState, TableSkeleton } from "@/components/states";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Plus, MessageCircle, Send } from "lucide-react";

export default function ShopCustomersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");
  const [editor, setEditor] = useState<{ customer?: Customer } | null>(null);
  const queryClient = useQueryClient();

  const customers = useQuery({
    queryKey: ["shop", "customers", page, search],
    queryFn: () => customersApi.list({ page, limit: 20, search: search || undefined }),
  });
  const dues = useQuery({
    queryKey: ["shop", "customers", "due"],
    queryFn: () => customersApi.duePayments({ page: 1, limit: 50 }),
    enabled: tab === "due",
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["shop", "customers"] });

  const rows = customers.data?.data ?? [];

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Customer records, balances and payment reminders."
        actions={
          <Button onClick={() => setEditor({})}>
            <Plus className="h-4 w-4" /> Add customer
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">All customers</TabsTrigger>
          <TabsTrigger value="due">Due payments</TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <div className="mb-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search customers…"
                className="pl-9"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
          </div>

          {customers.isLoading ? (
            <TableSkeleton />
          ) : customers.isError ? (
            <ErrorState
              message={customers.error instanceof ApiError ? customers.error.message : "Could not load customers."}
              onRetry={() => customers.refetch()}
            />
          ) : rows.length === 0 ? (
            <EmptyState
              title="No customers yet"
              description="Add your first customer."
              action={<Button onClick={() => setEditor({})}><Plus className="h-4 w-4" /> Add customer</Button>}
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <Link href={`/shop/customers/${c.id}`} className="font-medium hover:underline">
                            {c.name}
                          </Link>
                          <div className="text-xs text-muted-foreground">{c.email ?? "-"}</div>
                        </TableCell>
                        <TableCell>{c.phone ?? "-"}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant={Number(c.balance) > 0 ? "warning" : "success"}>{inr(c.balance)}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
          <Pagination page={page} limit={20} total={customers.data?.meta.total ?? 0} onPageChange={setPage} />
        </TabsContent>

        <TabsContent value="due">
          <DueList query={dues} />
        </TabsContent>
      </Tabs>

      {editor && (
        <CustomerEditor customer={editor.customer} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); invalidate(); }} />
      )}
    </div>
  );
}

function DueList({ query }: { query: ReturnType<typeof useQuery> }) {
  const rows = ((query.data as { data?: (Customer & { dueAmount: string })[] })?.data ?? []);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const remind = async (id: string, kind: "sms" | "whatsapp") => {
    setBusyId(id + kind);
    setNote(null);
    try {
      if (kind === "sms") await customersApi.sendSmsReminder(id);
      else await customersApi.sendWhatsappReminder(id);
      setNote(`Reminder sent via ${kind === "sms" ? "SMS" : "WhatsApp"}.`);
    } catch (err) {
      setNote(err instanceof ApiError ? err.message : "Could not send the reminder.");
    } finally {
      setBusyId(null);
    }
  };

  if (query.isLoading) return <TableSkeleton />;
  if (query.isError)
    return (
      <ErrorState
        message={query.error instanceof ApiError ? query.error.message : "Could not load dues."}
        onRetry={() => query.refetch()}
      />
    );
  if (rows.length === 0) return <EmptyState title="No dues" description="All customers are paid up." />;

  return (
    <Card>
      <CardContent className="p-0">
        {note && <div className="border-b p-3 text-sm text-muted-foreground">{note}</div>}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead className="text-right">Due amount</TableHead>
              <TableHead className="text-right">Remind</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Link href={`/shop/customers/${c.id}`} className="font-medium hover:underline">{c.name}</Link>
                  <div className="text-xs text-muted-foreground">{c.phone ?? "-"}</div>
                </TableCell>
                <TableCell className="text-right font-semibold">{inr(c.dueAmount)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="outline" disabled={busyId === c.id + "sms"} onClick={() => remind(c.id, "sms")}>
                      <Send className="h-3.5 w-3.5 mr-1" /> SMS
                    </Button>
                    <Button size="sm" variant="outline" disabled={busyId === c.id + "whatsapp"} onClick={() => remind(c.id, "whatsapp")}>
                      <MessageCircle className="h-3.5 w-3.5 mr-1" /> WhatsApp
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function CustomerEditor({ customer, onClose, onSaved }: { customer?: Customer; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(customer?.name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [address, setAddress] = useState(customer?.address ?? "");
  const [gstNumber, setGstNumber] = useState(customer?.gstNumber ?? "");
  const [creditLimit, setCreditLimit] = useState(customer?.creditLimit ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Customer name is required.");
    setBusy(true);
    try {
      const body = {
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        gstNumber: gstNumber.trim() || undefined,
        creditLimit: creditLimit || undefined,
      };
      if (customer) await customersApi.update(customer.id, body);
      else await customersApi.create(body);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the customer.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{customer ? "Edit customer" : "Add customer"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="text-sm text-destructive">{error}</div>}
          <div className="space-y-2">
            <Label htmlFor="c-name">Name *</Label>
            <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="c-phone">Phone</Label>
              <Input id="c-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-email">Email</Label>
              <Input id="c-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-addr">Address</Label>
            <Input id="c-addr" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="c-gst">GST number</Label>
              <Input id="c-gst" value={gstNumber} onChange={(e) => setGstNumber(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-cl">Credit limit</Label>
              <Input id="c-cl" type="number" min="0" step="0.01" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : customer ? "Save changes" : "Add customer"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
