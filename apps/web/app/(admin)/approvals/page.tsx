"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi, ApiError } from "@/lib/api";
import { formatDateTime, toTitle } from "@/lib/format";
import { PageHeader, ErrorState, EmptyState, TableSkeleton } from "@/components/states";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export default function AdminApprovalsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("PENDING");
  const [action, setAction] = useState<{ id: string; kind: "approve" | "reject" | "modify" } | null>(null);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["admin", "approvals", page, status],
    queryFn: () => adminApi.approvals({ page, limit: 20, status: status || undefined }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin", "approvals"] });

  const rows = query.data?.data ?? [];
  const total = query.data?.meta.total ?? 0;

  return (
    <div>
      <PageHeader title="Approvals" description="Review profile changes, subscription and shop activation requests." />

      <div className="mb-4 max-w-xs">
        <Select
          value={status}
          onChange={(v) => { setStatus(v); setPage(1); }}
          options={[
            { value: "", label: "All statuses" },
            { value: "PENDING", label: "Pending" },
            { value: "APPROVED", label: "Approved" },
            { value: "REJECTED", label: "Rejected" },
          ]}
        />
      </div>

      {query.isLoading ? (
        <TableSkeleton />
      ) : query.isError ? (
        <ErrorState
          message={query.error instanceof ApiError ? query.error.message : "Could not load approvals."}
          onRetry={() => query.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState title="No approval requests" description="New requests from shops will appear here." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Shop</TableHead>
                  <TableHead>Requested change</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell><Badge variant="secondary">{toTitle(a.type)}</Badge></TableCell>
                    <TableCell>{a.shopName ?? a.shopId ?? "-"}</TableCell>
                    <TableCell className="max-w-xs truncate text-xs">{summarizeChange(a.requestedValue)}</TableCell>
                    <TableCell>
                      <Badge variant={a.status === "PENDING" ? "warning" : a.status === "APPROVED" ? "success" : "destructive"}>
                        {toTitle(a.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDateTime(a.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      {a.status === "PENDING" && (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" onClick={() => setAction({ id: a.id, kind: "approve" })}>Approve</Button>
                          <Button size="sm" variant="outline" onClick={() => setAction({ id: a.id, kind: "modify" })}>Modify</Button>
                          <Button size="sm" variant="destructive" onClick={() => setAction({ id: a.id, kind: "reject" })}>Reject</Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Pagination page={page} limit={20} total={total} onPageChange={setPage} />

      {action && <ActionDialog action={action} onClose={() => setAction(null)} onDone={invalidate} />}
    </div>
  );
}

function summarizeChange(value: Record<string, unknown>): string {
  return Object.entries(value)
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join("; ");
}

function ActionDialog({
  action,
  onClose,
  onDone,
}: {
  action: { id: string; kind: "approve" | "reject" | "modify" };
  onClose: () => void;
  onDone: () => void;
}) {
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (action.kind !== "approve" && !comment.trim()) {
      setError("A comment is required.");
      return;
    }
    setBusy(true);
    try {
      if (action.kind === "approve") await adminApi.approveApproval(action.id);
      if (action.kind === "reject") await adminApi.rejectApproval(action.id, comment.trim());
      if (action.kind === "modify") await adminApi.requestModification(action.id, comment.trim() || undefined);
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  };

  const titles = { approve: "Approve request", reject: "Reject request", modify: "Request modification" };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{titles[action.kind]}</DialogTitle>
          <DialogDescription>This decision is recorded in the audit log.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {error && <div className="text-sm text-destructive">{error}</div>}
          <Label htmlFor="comment">Comment {action.kind !== "approve" && "*"}</Label>
          <Textarea id="comment" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Reviewer note…" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant={action.kind === "reject" ? "destructive" : "default"} onClick={submit} disabled={busy}>
            {busy ? "Saving…" : titles[action.kind]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
