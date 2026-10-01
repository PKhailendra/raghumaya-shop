"use client";

import { useParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { customersApi, ApiError, type LedgerEntry } from "@/lib/api";
import { formatDateTime, inr, toTitle } from "@/lib/format";
import { PageHeader, ErrorState, EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Send, MessageCircle } from "lucide-react";
import { useState } from "react";

export default function ShopCustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [note, setNote] = useState<string | null>(null);

  const customer = useQuery({ queryKey: ["shop", "customer", id], queryFn: () => customersApi.get(id) });
  const ledger = useQuery({ queryKey: ["shop", "customer", id, "ledger"], queryFn: () => customersApi.ledger(id) });
  const purchases = useQuery({ queryKey: ["shop", "customer", id, "purchases"], queryFn: () => customersApi.purchases(id, { page: 1, limit: 20 }) });

  const remind = useMutation({
    mutationFn: (kind: "sms" | "whatsapp") =>
      kind === "sms" ? customersApi.sendSmsReminder(id) : customersApi.sendWhatsappReminder(id),
    onSuccess: (_, kind) => setNote(`Reminder sent via ${kind === "sms" ? "SMS" : "WhatsApp"}.`),
    onError: (err) => setNote(err instanceof ApiError ? err.message : "Could not send the reminder."),
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

  return (
    <div>
      <PageHeader
        title={c.name}
        description={`${c.phone ?? ""} ${c.email ? `· ${c.email}` : ""}`}
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => remind.mutate("sms")} disabled={remind.isPending}>
              <Send className="h-3.5 w-3.5 mr-1" /> SMS reminder
            </Button>
            <Button size="sm" variant="outline" onClick={() => remind.mutate("whatsapp")} disabled={remind.isPending}>
              <MessageCircle className="h-3.5 w-3.5 mr-1" /> WhatsApp reminder
            </Button>
          </div>
        }
      />

      {note && <div className="mb-4 rounded-md border p-3 text-sm">{note}</div>}

      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Balance</div>
            <div className="text-2xl font-bold">{inr(c.balance)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Total purchases</div>
            <div className="text-2xl font-bold">{inr(totalPurchases)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Credit limit</div>
            <div className="text-2xl font-bold">{c.creditLimit ? inr(c.creditLimit) : "Not set"}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="ledger">
        <TabsList>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
          <TabsTrigger value="purchases">Purchases</TabsTrigger>
          <TabsTrigger value="info">Info</TabsTrigger>
        </TabsList>

        <TabsContent value="ledger">
          {ledger.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : ledger.isError ? (
            <ErrorState
              message={ledger.error instanceof ApiError ? ledger.error.message : "Could not load the ledger."}
              onRetry={() => ledger.refetch()}
            />
          ) : ledgerRows.length === 0 ? (
            <EmptyState title="No ledger entries" />
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledgerRows.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="whitespace-nowrap text-xs">{formatDateTime(e.date)}</TableCell>
                        <TableCell><Badge variant="secondary">{toTitle(e.type)}</Badge></TableCell>
                        <TableCell className="text-xs">{e.reference}</TableCell>
                        <TableCell className="text-right">{inr(e.debit)}</TableCell>
                        <TableCell className="text-right">{inr(e.credit)}</TableCell>
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
