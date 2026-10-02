"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { reportsApi, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useShop, Can } from "@/lib/shop-context";
import { inr, formatDate } from "@/lib/format";
import { PageHeader, ErrorState, TableSkeleton } from "@/components/states";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Printer } from "lucide-react";

/** Local (device timezone) YYYY-MM-DD — avoids the UTC midnight shift. */
function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  PAID: "default",
  PARTIALLY_PAID: "secondary",
  ISSUED: "outline",
  OVERDUE: "destructive",
};

export default function DailyClosingPage() {
  const { activeShopId } = useAuth();
  const { can } = useShop();
  const [date, setDate] = useState(todayLocal());

  const allowed = can("ANALYTICS_VIEW", "FINANCE_VIEW");

  const report = useQuery({
    queryKey: ["shop", "reports", "daily-closing", date],
    queryFn: () => reportsApi.dailyClosing({ date }),
    enabled: !!activeShopId && allowed && /^\d{4}-\d{2}-\d{2}$/.test(date),
  });

  const data = report.data;

  return (
    <Can any={["ANALYTICS_VIEW", "FINANCE_VIEW"]}>
      <style>{`
        @media print {
          aside, header, .no-print { display: none !important; }
          main { padding: 0 !important; }
          .print-report { max-width: 100% !important; }
          body { background: #fff !important; }
        }
      `}</style>
      <div className="print-report">
        <PageHeader
          title="Daily Closing Report"
          description={data ? `Summary for ${formatDate(data.date)}` : "Pick a date to see the day's summary"}
          actions={
            <div className="no-print flex items-end gap-3">
              <div className="grid gap-1">
                <Label htmlFor="closing-date">Date</Label>
                <Input
                  id="closing-date"
                  type="date"
                  value={date}
                  max={todayLocal()}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (/^\d{4}-\d{2}-\d{2}$/.test(v) && v <= todayLocal()) setDate(v);
                  }}
                />
              </div>
              <Button variant="outline" onClick={() => window.print()} disabled={!data}>
                <Printer className="mr-2 h-4 w-4" />
                Print
              </Button>
            </div>
          }
        />

        {report.isError && (
          <ErrorState
            message={report.error instanceof ApiError ? report.error.message : "Could not load the report."}
            onRetry={() => report.refetch()}
          />
        )}

        {report.isLoading || !data ? (
          !report.isError && <TableSkeleton rows={6} />
        ) : (
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              <StatCard
                title="Total Sales"
                value={inr(data.sales.totalSales)}
                sub={`${data.sales.invoiceCount} invoices · avg ${inr(data.sales.averageOrderValue)}`}
              />
              <StatCard
                title="Collected"
                value={inr(data.collections.totalCollected)}
                sub={
                  data.collections.byMode.length > 0
                    ? data.collections.byMode.map((m) => `${m.mode}: ${inr(m.amount)}`).join(" · ")
                    : "No payments recorded"
                }
              />
              <StatCard title="New Due (credit given)" value={inr(data.credit.newDue)} sub={`${data.credit.dueInvoiceCount} invoices with balance`} />
              <StatCard title="Expenses" value={inr(data.expenses.totalExpenses)} sub={`${data.expenses.count} expense entries`} />
              <StatCard title="Salary Paid" value={inr(data.salary.salaryPaid)} sub={`${data.salary.count} payments`} />
              <StatCard title="Net Cash" value={inr(data.cash.netCash)} sub="Collected − expenses − salary" />
            </div>

            {/* Invoices table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Invoices — {formatDate(data.date)}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {data.invoices.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">No invoices issued on this date.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="px-4 py-2 font-medium">Invoice</th>
                          <th className="px-4 py-2 font-medium">Customer</th>
                          <th className="px-4 py-2 font-medium">Status</th>
                          <th className="px-4 py-2 text-right font-medium">Total</th>
                          <th className="px-4 py-2 text-right font-medium">Paid</th>
                          <th className="px-4 py-2 text-right font-medium">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.invoices.map((inv) => (
                          <tr key={inv.id} className="border-b last:border-0">
                            <td className="px-4 py-2 font-medium">{inv.invoiceNumber}</td>
                            <td className="px-4 py-2">{inv.customerName ?? "Walk-in"}</td>
                            <td className="px-4 py-2">
                              <Badge variant={STATUS_VARIANT[inv.status] ?? "outline"}>
                                {inv.status.replace(/_/g, " ")}
                              </Badge>
                            </td>
                            <td className="px-4 py-2 text-right">{inr(inv.totalAmount)}</td>
                            <td className="px-4 py-2 text-right">{inr(inv.paidAmount)}</td>
                            <td className="px-4 py-2 text-right font-medium">{inr(inv.balanceAmount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top products */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top Products Sold</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {data.topProducts.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">No products sold on this date.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="px-4 py-2 font-medium">Product</th>
                          <th className="px-4 py-2 text-right font-medium">Qty</th>
                          <th className="px-4 py-2 text-right font-medium">Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.topProducts.map((p, i) => (
                          <tr key={`${p.productId ?? p.description}-${i}`} className="border-b last:border-0">
                            <td className="px-4 py-2">{p.description}</td>
                            <td className="px-4 py-2 text-right">{p.quantity}</td>
                            <td className="px-4 py-2 text-right font-medium">{inr(p.revenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <p className="text-xs text-muted-foreground">{data.cash.note}</p>
          </div>
        )}
      </div>
    </Can>
  );
}
