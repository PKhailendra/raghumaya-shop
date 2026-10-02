"use client";

import { useQuery } from "@tanstack/react-query";
import { analyticsApi, stockApi, ApiError } from "@/lib/api";
import { inr } from "@/lib/format";
import { PageHeader, ErrorState, CardsSkeleton, EmptyState } from "@/components/states";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SimpleBarChart } from "@/components/charts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, Wallet, Package, AlertCircle } from "lucide-react";

export default function ShopDashboardPage() {
  const summary = useQuery({ queryKey: ["shop", "analytics", "dashboard"], queryFn: () => analyticsApi.dashboard() });
  const daily = useQuery({ queryKey: ["shop", "analytics", "sales-daily"], queryFn: () => analyticsApi.salesDaily({ days: 30 }) });
  const weekly = useQuery({ queryKey: ["shop", "analytics", "sales-weekly"], queryFn: () => analyticsApi.salesWeekly({ weeks: 12 }) });
  const monthly = useQuery({ queryKey: ["shop", "analytics", "sales-monthly"], queryFn: () => analyticsApi.salesMonthly({ months: 12 }) });
  const topProducts = useQuery({ queryKey: ["shop", "analytics", "top-products"], queryFn: () => analyticsApi.topProducts({ limit: 5 }) });
  const topCustomers = useQuery({ queryKey: ["shop", "analytics", "top-customers"], queryFn: () => analyticsApi.topCustomers({ limit: 5 }) });
  const lowStock = useQuery({ queryKey: ["shop", "inventory", "low-stock"], queryFn: () => stockApi.lowStockAlerts() });

  if (summary.isLoading) {
    return (
      <div>
        <PageHeader title="Shop dashboard" />
        <CardsSkeleton count={6} />
      </div>
    );
  }

  if (summary.isError) {
    return (
      <div>
        <PageHeader title="Shop dashboard" />
        <ErrorState
          message={summary.error instanceof ApiError ? summary.error.message : "Could not load analytics."}
          onRetry={() => summary.refetch()}
        />
      </div>
    );
  }

  const d = summary.data as Record<string, unknown>;
  const money = (v: unknown) => inr(typeof v === "string" || typeof v === "number" ? v : 0);

  return (
    <div>
      <PageHeader title="Shop dashboard" description="Sales, revenue and stock at a glance." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard title="Today's sales" value={money(d.todaySales)} icon={Wallet} />
        <StatCard title="This month's revenue" value={money(d.monthRevenue)} icon={TrendingUp} sub={`Growth: ${d.revenueGrowthPercent ?? 0}%`} />
        <StatCard title="Profit margin" value={`${d.profitMarginPercent ?? 0}%`} icon={TrendingUp} />
        <StatCard title="Inventory value" value={money(d.inventoryValue)} icon={Package} />
        <StatCard title="Outstanding payments" value={money(d.outstandingPayments)} icon={AlertCircle} />
        <StatCard title="Total products" value={String(d.totalProducts ?? 0)} icon={Package} sub={`${d.totalCustomers ?? 0} customers`} />
      </div>

      {(lowStock.data?.length ?? 0) > 0 && (
        <Card className="mt-6 border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-800">
              <AlertCircle className="h-5 w-5" />
              Low stock alert ({lowStock.data!.length} items)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Product</TableHead><TableHead>Stock</TableHead><TableHead>Min level</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {lowStock.data!.slice(0, 5).map((s: { id: string; productName: string; productId: string; quantity: number; minLevel?: number }) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.productName || s.productId}</TableCell>
                    <TableCell className="text-red-600 font-medium">{s.quantity}</TableCell>
                    <TableCell>{s.minLevel ?? "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <a href="/shop/inventory?lowStock=true" className="text-sm text-blue-600 hover:underline mt-2 inline-block">
              View all low stock items →
            </a>
          </CardContent>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Sales trend</CardTitle>
        </CardHeader>        <CardContent>
          <Tabs defaultValue="daily">
            <TabsList>
              <TabsTrigger value="daily">Daily</TabsTrigger>
              <TabsTrigger value="weekly">Weekly</TabsTrigger>
              <TabsTrigger value="monthly">Monthly</TabsTrigger>
            </TabsList>
            <TabsContent value="daily">
              <SalesChart query={daily} xKey="date" />
            </TabsContent>
            <TabsContent value="weekly">
              <SalesChart query={weekly} xKey="week" />
            </TabsContent>
            <TabsContent value="monthly">
              <SalesChart query={monthly} xKey="month" />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top products</CardTitle>
          </CardHeader>
          <CardContent>
            <TopTable
              rows={(topProducts.data ?? []) as Record<string, unknown>[]}
              nameKey="productName"
              valueKey="revenue"
              valueLabel="Revenue"
              empty="No sales yet"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Top customers</CardTitle>
          </CardHeader>
          <CardContent>
            <TopTable
              rows={(topCustomers.data ?? []) as Record<string, unknown>[]}
              nameKey="customerName"
              valueKey="totalSpent"
              valueLabel="Total spent"
              empty="No customers yet"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SalesChart({ query, xKey }: { query: { data?: unknown[]; isLoading: boolean }; xKey: string }) {
  if (query.isLoading) return <div className="h-[280px] animate-pulse rounded-md bg-muted" />;
  const data = (query.data ?? []) as unknown[];
  if (data.length === 0) return <EmptyState title="No sales data" />;
  return <SimpleBarChart data={data} xKey={xKey} dataKey="sales" name="Sales" />;
}

function TopTable({
  rows,
  nameKey,
  valueKey,
  valueLabel,
  empty,
}: {
  rows: Record<string, unknown>[];
  nameKey: string;
  valueKey: string;
  valueLabel: string;
  empty: string;
}) {
  if (rows.length === 0) return <EmptyState title={empty} />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead className="text-right">{valueLabel}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={i}>
            <TableCell className="font-medium">{String(r[nameKey] ?? "-")}</TableCell>
            <TableCell className="text-right">{inr(typeof r[valueKey] === "string" || typeof r[valueKey] === "number" ? r[valueKey] : 0)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
