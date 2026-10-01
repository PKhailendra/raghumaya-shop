"use client";

import { useQuery } from "@tanstack/react-query";
import { adminApi, ApiError } from "@/lib/api";
import { inr } from "@/lib/format";
import { PageHeader, ErrorState, EmptyState } from "@/components/states";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SimpleAreaChart } from "@/components/charts";
import { Wallet, AlertCircle, RefreshCw } from "lucide-react";

export default function AdminFinancePage() {
  const summary = useQuery({
    queryKey: ["admin", "finance", "summary"],
    queryFn: () => adminApi.financeSummary(),
  });

  if (summary.isLoading) {
    return (
      <div>
        <PageHeader title="Platform finance" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5 h-28 animate-pulse bg-muted" /></Card>
          ))}
        </div>
      </div>
    );
  }

  if (summary.isError || !summary.data) {
    return (
      <div>
        <PageHeader title="Platform finance" />
        <ErrorState
          message={summary.error instanceof ApiError ? summary.error.message : "Could not load finance data."}
          onRetry={() => summary.refetch()}
        />
      </div>
    );
  }

  const d = summary.data as Record<string, unknown>;
  const money = (v: unknown) => inr(typeof v === "string" || typeof v === "number" ? v : 0);
  const growth = (d.revenueGrowth as unknown[]) ?? [];

  return (
    <div>
      <PageHeader title="Platform finance" description="Revenue collected across the platform." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total revenue" value={money(d.totalRevenue)} icon={Wallet} />
        <StatCard title="Monthly revenue" value={money(d.monthlyRevenue)} icon={Wallet} />
        <StatCard title="Annual revenue" value={money(d.annualRevenue)} icon={Wallet} />
        <StatCard title="Pending payments" value={money(d.pendingPayments)} icon={AlertCircle} />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Revenue growth</CardTitle>
        </CardHeader>
        <CardContent>
          {growth.length === 0 ? (
            <EmptyState title="No revenue data yet" />
          ) : (
            <SimpleAreaChart data={growth} xKey="date" dataKey="revenue" name="Revenue" />
          )}
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <StatCard title="Failed payments" value={String(d.failedPayments ?? 0)} icon={AlertCircle} />
        <StatCard title="Subscription renewals due" value={String(d.subscriptionRenewals ?? 0)} icon={RefreshCw} />
      </div>
    </div>
  );
}
