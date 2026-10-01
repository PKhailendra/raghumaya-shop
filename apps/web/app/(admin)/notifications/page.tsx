"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notificationsApi, ApiError } from "@/lib/api";
import { formatDateTime, toTitle } from "@/lib/format";
import { PageHeader, ErrorState, EmptyState, TableSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useState } from "react";
import { CheckCheck, Send } from "lucide-react";

export default function AdminNotificationsPage() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["admin", "notifications"],
    queryFn: () => notificationsApi.list({ page: 1, limit: 50 }),
  });

  const markRead = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "notifications"] }),
  });

  const retry = useMutation({
    mutationFn: (id: string) => notificationsApi.retry(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "notifications"] }),
  });

  const rows = query.data?.data ?? [];

  return (
    <div>
      <PageHeader title="Notifications" description="In-app, SMS, email and push delivery records." />

      {query.isLoading ? (
        <TableSkeleton />
      ) : query.isError ? (
        <ErrorState
          message={query.error instanceof ApiError ? query.error.message : "Could not load notifications."}
          onRetry={() => query.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState title="No notifications yet" />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {rows.map((n) => (
                <li key={n.id} className="flex items-start justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{n.title}</span>
                      <Badge variant="secondary">{toTitle(n.category)}</Badge>
                      {n.channel && <Badge variant="outline">{toTitle(n.channel)}</Badge>}
                      <Badge variant={n.status === "SENT" ? "success" : n.status === "FAILED" ? "destructive" : "warning"}>
                        {toTitle(n.status)}
                      </Badge>
                    </div>
                    {n.body && <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{n.body}</p>}
                    <div className="mt-1 text-xs text-muted-foreground">{formatDateTime(n.createdAt)}</div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {n.status === "FAILED" && (
                      <Button size="sm" variant="outline" onClick={() => retry.mutate(n.id)} disabled={retry.isPending}>
                        <Send className="h-3.5 w-3.5 mr-1" /> Retry
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => markRead.mutate(n.id)} disabled={markRead.isPending}>
                      <CheckCheck className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
