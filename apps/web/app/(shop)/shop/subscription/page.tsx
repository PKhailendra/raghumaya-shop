"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { subscriptionsApi, ApiError, type Plan } from "@/lib/api";
import { formatDateTime, inr, toTitle } from "@/lib/format";
import { PageHeader, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, Crown } from "lucide-react";

export default function ShopSubscriptionPage() {
  const [changeOpen, setChangeOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const queryClient = useQueryClient();

  const current = useQuery({ queryKey: ["shop", "subscription", "current"], queryFn: () => subscriptionsApi.current() });
  const plans = useQuery({ queryKey: ["plans"], queryFn: () => subscriptionsApi.plans() });
  const limits = useQuery({ queryKey: ["shop", "subscription", "limits"], queryFn: () => subscriptionsApi.limits() });

  const cancelMutation = useMutation({
    mutationFn: () => subscriptionsApi.cancel(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shop", "subscription"] }),
  });

  if (current.isLoading || plans.isLoading) {
    return (
      <div>
        <PageHeader title="Subscription" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (current.isError) {
    return (
      <div>
        <PageHeader title="Subscription" />
        <ErrorState
          message={current.error instanceof ApiError ? current.error.message : "Could not load your subscription."}
          onRetry={() => current.refetch()}
        />
      </div>
    );
  }

  const sub = current.data;
  if (!sub) {
    return (
      <div>
        <PageHeader title="Subscription" />
        <ErrorState message="No subscription data was returned." onRetry={() => current.refetch()} />
      </div>
    );
  }
  const planList = plans.data ?? [];
  const currentPlan = planList.find((p) => p.id === sub.planId);
  const usage = (limits.data ?? {}) as Record<string, { used?: number; limit?: number; label?: string }>;

  return (
    <div>
      <PageHeader title="Subscription" description="Your plan, usage and billing." />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5" /> Current plan
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold">{sub.planName}</span>
              <Badge variant={sub.status === "ACTIVE" ? "success" : sub.status === "TRIAL" ? "info" : "warning"}>
                {toTitle(sub.status)}
              </Badge>
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              Started {formatDateTime(sub.startDate)}
              {sub.trialEndsAt && ` · Trial ends ${formatDateTime(sub.trialEndsAt)}`}
              {sub.endDate && ` · Renews ${formatDateTime(sub.endDate)}`}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setChangeOpen(true)}>Change plan</Button>
            {sub.status === "ACTIVE" && (
              <Button variant="destructive" onClick={() => setCancelOpen(true)}>Cancel</Button>
            )}
          </div>
        </CardContent>
      </Card>

      <h2 className="text-lg font-semibold mb-3">Usage</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        {Object.entries(usage).map(([key, u]) => (
          <Card key={key}>
            <CardContent className="p-5">
              <div className="text-sm text-muted-foreground">{u.label ?? toTitle(key)}</div>
              <div className="mt-1 text-xl font-bold">
                {u.used ?? 0} <span className="text-sm font-normal text-muted-foreground">/ {u.limit ?? "∞"}</span>
              </div>
              {typeof u.limit === "number" && u.limit > 0 && (
                <div className="mt-2 h-2 rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-primary"
                    style={{ width: `${Math.min(100, ((u.used ?? 0) / u.limit) * 100)}%` }}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {Object.keys(usage).length === 0 && (
          <div className="text-sm text-muted-foreground col-span-full">No usage limits on this plan.</div>
        )}
      </div>

      <h2 className="text-lg font-semibold mb-3">Available plans</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {planList.map((plan) => (
          <PlanCard key={plan.id} plan={plan} active={plan.id === sub.planId} onChoose={() => setChangeOpen(true)} />
        ))}
      </div>

      {changeOpen && (
        <ChangePlanDialog
          plans={planList}
          currentPlanId={sub.planId}
          onClose={() => setChangeOpen(false)}
          onDone={() => { setChangeOpen(false); queryClient.invalidateQueries({ queryKey: ["shop", "subscription"] }); }}
        />
      )}

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel subscription"
        description="Cancel your subscription at the end of the current billing period? You will keep access until then."
        confirmLabel="Cancel subscription"
        destructive
        busy={cancelMutation.isPending}
        onConfirm={() => { void cancelMutation.mutateAsync(); }}
      />
    </div>
  );
}

function PlanCard({ plan, active, onChoose }: { plan: Plan; active: boolean; onChoose: () => void }) {
  return (
    <Card className={active ? "border-primary" : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          {plan.name}
          {active && <Badge>Current</Badge>}
        </CardTitle>
        <div className="text-2xl font-bold">
          {inr(plan.price)}
          <span className="text-sm font-normal text-muted-foreground">/{plan.billingCycle}</span>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1 text-sm text-muted-foreground mb-4">
          {plan.features.map((f) => (
            <li key={f} className="flex items-start gap-2">
              <Check className="h-3.5 w-3.5 mt-0.5 text-emerald-600" /> {f}
            </li>
          ))}
        </ul>
        {!active && (
          <Button size="sm" variant="outline" className="w-full" onClick={onChoose}>
            Choose plan
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function ChangePlanDialog({
  plans,
  currentPlanId,
  onClose,
  onDone,
}: {
  plans: Plan[];
  currentPlanId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [planCode, setPlanCode] = useState(plans.find((p) => p.id !== currentPlanId)?.code ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (!planCode) return setError("Choose a plan.");
    setBusy(true);
    try {
      await subscriptionsApi.change({ planCode });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not change the plan.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Change plan</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {error && <div className="text-sm text-destructive">{error}</div>}
          <div className="space-y-2">
            <Label>New plan</Label>
            <Select
              value={planCode}
              onChange={setPlanCode}
              options={plans.filter((p) => p.id !== currentPlanId).map((p) => ({ value: p.code, label: `${p.name} — ${inr(p.price)}` }))}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy}>{busy ? "Changing…" : "Change plan"}</Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
