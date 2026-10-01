"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi, ApiError } from "@/lib/api";
import { formatDateTime, toTitle } from "@/lib/format";
import { PageHeader, ErrorState, EmptyState, TableSkeleton } from "@/components/states";
import { Pagination } from "@/components/pagination";
import { StatCard } from "@/components/stat-card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";

export default function AdminAuditLogsPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const query = useQuery({
    queryKey: ["admin", "audit-logs", page, action, entityType, from, to],
    queryFn: () =>
      adminApi.auditLogs({
        page,
        limit: 25,
        action: action || undefined,
        entityType: entityType || undefined,
        from: from || undefined,
        to: to || undefined,
      }),
  });

  const rows = query.data?.data ?? [];
  const total = query.data?.meta.total ?? 0;

  return (
    <div>
      <PageHeader title="Audit logs" description="Every admin action, searchable and filterable." />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1">
          <Label>Action</Label>
          <Input placeholder="e.g. SHOP_SUSPENDED" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} />
        </div>
        <div className="space-y-1">
          <Label>Entity type</Label>
          <Select
            value={entityType}
            onChange={(v) => { setEntityType(v); setPage(1); }}
            placeholder="All types"
            options={[
              { value: "", label: "All types" },
              { value: "Shop", label: "Shop" },
              { value: "User", label: "User" },
              { value: "Subscription", label: "Subscription" },
              { value: "Approval", label: "Approval" },
              { value: "Ticket", label: "Ticket" },
            ]}
          />
        </div>
        <div className="space-y-1">
          <Label>From</Label>
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        </div>
        <div className="space-y-1">
          <Label>To</Label>
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
        </div>
        <div className="flex items-end">
          <StatCard title="Total events" value={String(total)} />
        </div>
      </div>

      {query.isLoading ? (
        <TableSkeleton />
      ) : query.isError ? (
        <ErrorState
          message={query.error instanceof ApiError ? query.error.message : "Could not load audit logs."}
          onRetry={() => query.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState title="No audit events" description="Try widening the filters." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-xs">{formatDateTime(log.createdAt)}</TableCell>
                    <TableCell>{log.actorName ?? log.actorId ?? "-"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-mono text-[11px]">{log.action}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {log.entityType ? `${toTitle(log.entityType)} · ${log.entityId?.slice(0, 8) ?? ""}` : "-"}
                    </TableCell>
                    <TableCell className="text-xs">{log.ipAddress ?? "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Pagination page={page} limit={25} total={total} onPageChange={setPage} />
    </div>
  );
}
