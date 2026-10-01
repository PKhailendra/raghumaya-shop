"use client";

import type React from "react";
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";

const STATUS_VARIANTS: Record<string, "success" | "warning" | "destructive" | "info" | "secondary"> = {
  OPEN: "warning",
  IN_PROGRESS: "info",
  RESOLVED: "success",
  CLOSED: "secondary",
};

const PRIORITY_VARIANTS: Record<string, "destructive" | "warning" | "info" | "secondary"> = {
  URGENT: "destructive",
  HIGH: "warning",
  MEDIUM: "info",
  LOW: "secondary",
};

export default function AdminSupportPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["admin", "tickets", page, status],
    queryFn: () => adminApi.tickets({ page, limit: 20, status: status || undefined }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin", "tickets"] });

  const resolveMutation = useMutation({
    mutationFn: (id: string) => adminApi.resolveTicket(id),
    onSuccess: invalidate,
  });
  const closeMutation = useMutation({
    mutationFn: (id: string) => adminApi.closeTicket(id),
    onSuccess: invalidate,
  });

  const rows = query.data?.data ?? [];
  const total = query.data?.meta.total ?? 0;
  const selectedTicket = rows.find((t) => t.id === selected);

  return (
    <div>
      <PageHeader
        title="Support"
        description="Ticket queue from shops."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New ticket
          </Button>
        }
      />

      <div className="mb-4 max-w-xs">
        <Select
          value={status}
          onChange={(v) => { setStatus(v); setPage(1); }}
          placeholder="All statuses"
          options={[
            { value: "", label: "All statuses" },
            { value: "OPEN", label: "Open" },
            { value: "IN_PROGRESS", label: "In progress" },
            { value: "RESOLVED", label: "Resolved" },
            { value: "CLOSED", label: "Closed" },
          ]}
        />
      </div>

      {query.isLoading ? (
        <TableSkeleton />
      ) : query.isError ? (
        <ErrorState
          message={query.error instanceof ApiError ? query.error.message : "Could not load tickets."}
          onRetry={() => query.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState title="No tickets" description="The queue is clear." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket</TableHead>
                  <TableHead>Shop</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((t) => (
                  <TableRow key={t.id} className="cursor-pointer" onClick={() => setSelected(t.id)}>
                    <TableCell className="font-mono text-xs">{t.ticketNo}</TableCell>
                    <TableCell>{t.shopName ?? "-"}</TableCell>
                    <TableCell className="max-w-xs truncate">{t.subject}</TableCell>
                    <TableCell><Badge variant={PRIORITY_VARIANTS[t.priority] ?? "secondary"}>{toTitle(t.priority)}</Badge></TableCell>
                    <TableCell><Badge variant={STATUS_VARIANTS[t.status] ?? "secondary"}>{toTitle(t.status)}</Badge></TableCell>
                    <TableCell>{formatDateTime(t.updatedAt)}</TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        {t.status !== "RESOLVED" && t.status !== "CLOSED" && (
                          <Button size="sm" variant="outline" onClick={() => resolveMutation.mutate(t.id)} disabled={resolveMutation.isPending}>
                            Resolve
                          </Button>
                        )}
                        {t.status !== "CLOSED" && (
                          <Button size="sm" variant="outline" onClick={() => closeMutation.mutate(t.id)} disabled={closeMutation.isPending}>
                            Close
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Pagination page={page} limit={20} total={total} onPageChange={setPage} />

      {selectedTicket && (
        <Dialog open onOpenChange={(v) => !v && setSelected(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {selectedTicket.ticketNo} — {selectedTicket.subject}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="flex gap-2">
                <Badge variant={PRIORITY_VARIANTS[selectedTicket.priority] ?? "secondary"}>{toTitle(selectedTicket.priority)}</Badge>
                <Badge variant={STATUS_VARIANTS[selectedTicket.status] ?? "secondary"}>{toTitle(selectedTicket.status)}</Badge>
              </div>
              <p className="whitespace-pre-wrap text-muted-foreground">{selectedTicket.description}</p>
              <div className="text-xs text-muted-foreground">
                Shop: {selectedTicket.shopName ?? "-"} · Created {formatDateTime(selectedTicket.createdAt)}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelected(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {createOpen && <CreateTicketDialog onClose={() => setCreateOpen(false)} onDone={() => { setCreateOpen(false); invalidate(); }} />}
    </div>
  );
}

function CreateTicketDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!subject.trim()) return setError("Subject is required.");
    if (!description.trim()) return setError("Description is required.");
    setBusy(true);
    try {
      await adminApi.createTicket({ subject: subject.trim(), description: description.trim(), priority });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the ticket.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New ticket</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="text-sm text-destructive">{error}</div>}
          <div className="space-y-2">
            <Label htmlFor="tk-subject">Subject *</Label>
            <Input id="tk-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tk-desc">Description *</Label>
            <Textarea id="tk-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Priority</Label>
            <Select
              value={priority}
              onChange={setPriority}
              options={["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => ({ value: p, label: toTitle(p) }))}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create ticket"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
