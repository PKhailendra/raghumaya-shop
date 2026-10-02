"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { adminApi, ApiError, shopTypeLabel } from "@/lib/api";
import { formatDateTime, inr, toTitle } from "@/lib/format";
import { PageHeader, ErrorState, EmptyState } from "@/components/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AdminShopDetailPage() {
  const { id } = useParams<{ id: string }>();
  const query = useQuery({
    queryKey: ["admin", "shop", id],
    queryFn: () => adminApi.getShop(id),
  });

  if (query.isLoading) {
    return (
      <div>
        <PageHeader title="Shop details" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div>
        <PageHeader title="Shop details" />
        <ErrorState
          message={query.error instanceof ApiError ? query.error.message : "Could not load this shop."}
          onRetry={() => query.refetch()}
        />
      </div>
    );
  }

  const shop = query.data;
  const members = (shop.members as unknown[]) ?? [];
  const subscription = shop.subscription as Record<string, unknown> | undefined;
  const audit = (shop.recentActivity as unknown[]) ?? [];
  const owner = members
    .map((m) => m as Record<string, string | null>)
    .find((m) => m.role === "OWNER") ?? null;

  return (
    <div>
      <PageHeader
        title={shop.name as string}
        description={`Shop ID: ${shop.id}`}
        actions={<Badge variant="success">{toTitle(shop.status as string)}</Badge>}
      />

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Info</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="subscription">Subscription</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <Card>
            <CardHeader>
              <CardTitle>Shop information</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 sm:grid-cols-2 text-sm">
                <InfoRow label="Name" value={shop.name as string} />
                <InfoRow label="Email" value={(shop.email as string) ?? "-"} />
                <InfoRow label="Phone" value={(shop.phone as string) ?? "-"} />
                <InfoRow label="GST number" value={(shop.gstNumber as string) ?? "-"} />
                <InfoRow label="Shop type" value={shopTypeLabel(shop.shopType as string | undefined)} />
                <InfoRow label="Owner" value={(shop.ownerName as string) ?? "-"} />
                <InfoRow label="Status" value={toTitle(shop.status as string)} />
                <InfoRow label="Created" value={formatDateTime(shop.createdAt as string)} />
              </dl>
              {owner && (
                <div className="mt-6">
                  <div className="font-medium mb-2 text-sm">Owner account</div>
                  <dl className="grid gap-3 sm:grid-cols-3 text-sm rounded-md border p-4">
                    <InfoRow label="Name" value={owner.name ?? "-"} />
                    <InfoRow label="Email" value={owner.email ?? "-"} />
                    <InfoRow label="Phone" value={owner.phone ?? "-"} />
                  </dl>
                </div>
              )}
              {shop.address && (
                <div className="mt-4 text-sm">
                  <div className="font-medium mb-1">Address</div>
                  <div className="text-muted-foreground">
                    {Object.values(shop.address as Record<string, string>).filter(Boolean).join(", ")}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="members">
          <Card>
            <CardHeader>
              <CardTitle>Members ({members.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {members.length === 0 ? (
                <EmptyState title="No members" />
              ) : (
                <ul className="space-y-3">
                  {members.map((m) => {
                    const member = m as Record<string, string>;
                    return (
                      <li key={member.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                        <div>
                          <div className="font-medium">{member.name}</div>
                          <div className="text-xs text-muted-foreground">{member.email ?? member.phone}</div>
                        </div>
                        <Badge variant="secondary">{toTitle(member.role)}</Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subscription">
          <Card>
            <CardHeader>
              <CardTitle>Subscription</CardTitle>
            </CardHeader>
            <CardContent>
              {!subscription ? (
                <EmptyState title="No subscription" description="This shop has no subscription assigned yet." />
              ) : (
                <dl className="grid gap-3 sm:grid-cols-2 text-sm">
                  <InfoRow label="Plan" value={String(subscription.planName ?? subscription.planCode ?? "-")} />
                  <InfoRow label="Status" value={toTitle(String(subscription.status ?? "-"))} />
                  <InfoRow label="Start date" value={formatDateTime(String(subscription.startDate ?? ""))} />
                  <InfoRow label="End date" value={formatDateTime(String(subscription.endDate ?? ""))} />
                  <InfoRow label="Amount" value={subscription.amount ? inr(String(subscription.amount)) : "-"} />
                </dl>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
            </CardHeader>
            <CardContent>
              {audit.length === 0 ? (
                <EmptyState title="No recent activity" />
              ) : (
                <ul className="space-y-2 text-sm">
                  {audit.map((a) => {
                    const entry = a as Record<string, string>;
                    return (
                      <li key={entry.id} className="flex items-center justify-between rounded-md border p-3">
                        <div>
                          <span className="font-medium">{entry.action}</span>
                          <span className="text-muted-foreground"> · {entry.entityType}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">{formatDateTime(entry.createdAt)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
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
