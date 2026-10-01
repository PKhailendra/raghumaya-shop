"use client";

import { useQuery } from "@tanstack/react-query";
import { adminApi, ApiError } from "@/lib/api";
import { inr } from "@/lib/format";
import { PageHeader, ErrorState, CardsSkeleton, EmptyState } from "@/components/states";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SimpleAreaChart, SimpleDonut } from "@/components/charts";
import { Store, Users, Wallet, BadgeIndianRupee, Clock, AlertCircle } from "lucide-react";

export default function AdminDashboardPage() {
  const summary = useQuery({
    queryKey: ["admin", "dashboard"],
    queryFn: () => adminApi.dashboard(),
  });

  const revenueGrowth = useQuery({
    queryKey: ["admin", "revenue-growth"],
    queryFn: () => adminApi.financeSummary().then((d) => d.revenueGrowth ?? []),
  });

  if (summary.isLoading) {
    return (
      <div>
        <PageHeader title="Platform dashboard" description="Overview of all shops, users and revenue." />
        <CardsSkeleton count={8} />
      </div>
    );
  }

  if (summary.isError) {
    return (
      <div>
        <PageHeader title="Platform dashboard" />
        <ErrorState
          message={summary.error instanceof ApiError ? summary.error.message : "Could not load the dashboard."}
          onRetry={() => summary.refetch()}
        />
      </div>
    );
  }

  const s = summary.data;
  if (!s) {
    return (
      <div>
        <PageHeader title="Platform overview" description="Live metrics across every shop." />
        <ErrorState message="No dashboard data was returned." onRetry={() => summary.refetch()} />
      </div>
    );
  }
  const dist = [
    { plan: "Free", count: s.subscriptions.free },
    { plan: "Starter", count: s.subscriptions.starter },
    { plan: "Professional", count: s.subscriptions.professional },
    { plan: "Enterprise", count: s.subscriptions.enterprise },
  ];

  return (
    <div>
      <PageHeader title="Platform dashboard" description="Overview of all shops, users and revenue." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total shops" value={String(s.shops.total)} icon={Store} sub={`${s.shops.newToday} new today · ${s.shops.newThisMonth} this month`} />
        <StatCard title="Active shops" value={String(s.shops.active)} icon={Store} sub={`${s.shops.blocked} blocked · ${s.shops.inactive} inactive`} />
        <StatCard title="Total users" value={String(s.users.total)} icon={Users} sub={`${s.users.active} active · ${s.users.suspended} suspended`} />
        <StatCard title="Platform revenue" value={inr(s.finance.totalPlatformRevenue)} icon={Wallet} sub={`${inr(s.finance.pendingPayments)} pending`} />
        <StatCard title="Daily revenue" value={inr(s.revenue.daily)} icon={Wallet} />
        <StatCard title="Weekly revenue" value={inr(s.revenue.weekly)} icon={Wallet} />
        <StatCard title="Monthly revenue" value={inr(s.revenue.monthly)} icon={Wallet} />
        <StatCard title="Yearly revenue" value={inr(s.revenue.yearly)} icon={BadgeIndianRupee} sub={`${s.finance.subscriptionRenewals} upcoming renewals`} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Revenue growth</CardTitle>
          </CardHeader>
          <CardContent>
            {revenueGrowth.isLoading ? (
              <div className="h-[280px] animate-pulse rounded-md bg-muted" />
            ) : (revenueGrowth.data as unknown[]).length === 0 ? (
              <EmptyState title="No revenue data yet" />
            ) : (
              <SimpleAreaChart data={revenueGrowth.data as unknown[]} xKey="date" dataKey="revenue" name="Revenue" />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Subscription distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleDonut data={dist} labelKey="plan" valueKey="count" />
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4" /> Pending renewals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{s.finance.subscriptionRenewals}</div>
            <p className="text-sm text-muted-foreground">Subscriptions renewing in the next 30 days.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4" /> Pending payments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{inr(s.finance.pendingPayments)}</div>
            <p className="text-sm text-muted-foreground">Across all platform invoices.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
