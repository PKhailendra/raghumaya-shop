"use client";

import type React from "react";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi, subscriptionsApi, ApiError, type Plan } from "@/lib/api";
import { formatDateTime, toTitle, inr } from "@/lib/format";
import { PageHeader, ErrorState, EmptyState, TableSkeleton } from "@/components/states";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function AdminSubscriptionsPage() {
  const [page, setPage] = useState(1);
  const [assignFor, setAssignFor] = useState<{ shopId: string; shopName: string } | null>(null);
  const queryClient = useQueryClient();

  const subs = useQuery({
    queryKey: ["admin", "subscriptions", page],
    queryFn: () => adminApi.subscriptions({ page, limit: 20 }),
  });
  const plans = useQuery({
    queryKey: ["plans"],
    queryFn: () => subscriptionsApi.plans(),
  });

  const rows = subs.data?.data ?? [];
  const total = subs.data?.meta.total ?? 0;

  return (
    <div>
      <PageHeader title="Subscriptions" description="Platform plans and shop subscription assignments." />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(plans.data ?? []).map((plan) => (
          <PlanCard key={plan.id} plan={plan} />
        ))}
      </div>

      <h2 className="text-lg font-semibold mb-3">Shop subscriptions</h2>
      {subs.isLoading ? (
        <TableSkeleton />
      ) : subs.isError ? (
        <ErrorState
          message={subs.error instanceof ApiError ? subs.error.message : "Could not load subscriptions."}
          onRetry={() => subs.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState title="No subscriptions" />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Shop</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.shopName ?? (s as { shopId?: string }).shopId ?? "-"}</TableCell>
                    <TableCell>{s.planName}</TableCell>
                    <TableCell>
                      <Badge variant={s.status === "ACTIVE" ? "success" : s.status === "TRIAL" ? "info" : "warning"}>
                        {toTitle(s.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDateTime(s.startDate)}</TableCell>
                    <TableCell>{formatDateTime(s.endDate)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setAssignFor({ shopId: (s as Record<string, string>).shopId ?? "", shopName: s.shopName ?? "-" })}
                      >
                        Change plan
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Pagination page={page} limit={20} total={total} onPageChange={setPage} />

      {assignFor && (
        <AssignPlanDialog
          shopId={assignFor.shopId}
          shopName={assignFor.shopName}
          plans={plans.data ?? []}
          onClose={() => setAssignFor(null)}
          onDone={() => {
            setAssignFor(null);
            queryClient.invalidateQueries({ queryKey: ["admin", "subscriptions"] });
          }}
        />
      )}
    </div>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{plan.name}</CardTitle>
        <div className="text-2xl font-bold">{inr(plan.price)}<span className="text-sm font-normal text-muted-foreground">/{plan.billingCycle}</span></div>
      </CardHeader>
      <CardContent>
        <ul className="text-sm space-y-1 text-muted-foreground">
          {plan.features.slice(0, 4).map((f) => (
            <li key={f}>• {f}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function AssignPlanDialog({
  shopId,
  shopName,
  plans,
  onClose,
  onDone,
}: {
  shopId: string;
  shopName: string;
  plans: Plan[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [planCode, setPlanCode] = useState(plans[0]?.code ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!planCode) return setError("Choose a plan.");
    setBusy(true);
    try {
      await adminApi.assignSubscription(shopId, { planCode });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not assign the plan.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Change plan — {shopName}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="text-sm text-destructive">{error}</div>}
          <div className="space-y-2">
            <Label>Plan</Label>
            <Select
              value={planCode}
              onChange={setPlanCode}
              options={plans.map((p) => ({ value: p.code, label: `${p.name} — ${inr(p.price)}` }))}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Assigning…" : "Assign plan"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
