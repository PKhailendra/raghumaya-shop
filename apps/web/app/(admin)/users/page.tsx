"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi, ApiError } from "@/lib/api";
import { formatDateTime, toTitle } from "@/lib/format";
import { PageHeader, ErrorState, EmptyState, TableSkeleton } from "@/components/states";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, KeyRound } from "lucide-react";

export default function AdminUsersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [resetTarget, setResetTarget] = useState<{ id: string; email: string } | null>(null);
  const [password, setPassword] = useState("");
  const [resetDone, setResetDone] = useState(false);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["admin", "users", page, search],
    queryFn: () => adminApi.users({ page, limit: 20, search: search || undefined }),
  });

  const resetMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) => adminApi.resetUserPassword(id, password),
    onSuccess: () => {
      setResetDone(true);
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });

  const users = query.data?.data ?? [];
  const total = query.data?.meta.total ?? 0;

  return (
    <div>
      <PageHeader title="Users" description="Platform admins and shop users. Reset passwords when needed." />

      <div className="mb-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search users…"
            className="pl-9"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      {query.isLoading ? (
        <TableSkeleton />
      ) : query.isError ? (
        <ErrorState
          message={query.error instanceof ApiError ? query.error.message : "Could not load users."}
          onRetry={() => query.refetch()}
        />
      ) : users.length === 0 ? (
        <EmptyState title="No users found" />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last login</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>
                      <Badge variant={u.status === "ACTIVE" ? "success" : "warning"}>{toTitle(u.status)}</Badge>
                    </TableCell>
                    <TableCell>{formatDateTime(u.lastLoginAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setPassword("");
                          setResetDone(false);
                          resetMutation.reset();
                          setResetTarget({ id: u.id, email: u.email });
                        }}
                      >
                        <KeyRound className="h-3.5 w-3.5 mr-1" /> Reset password
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

      {resetTarget && (
        <Dialog open onOpenChange={(v) => { if (!v) setResetTarget(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Reset password</DialogTitle>
              <DialogDescription>
                Set a new password for {resetTarget.email}. Only super admins can do this.
              </DialogDescription>
            </DialogHeader>
            {resetDone ? (
              <div className="space-y-4">
                <div className="text-sm text-green-600">Password updated for {resetTarget.email}.</div>
                <DialogFooter>
                  <Button onClick={() => setResetTarget(null)}>Done</Button>
                </DialogFooter>
              </div>
            ) : (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (password.length < 8) return;
                  resetMutation.mutate({ id: resetTarget.id, password });
                }}
              >
                {resetMutation.isError && (
                  <div className="text-sm text-destructive">
                    {resetMutation.error instanceof ApiError ? resetMutation.error.message : "Could not reset the password."}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="rp-password">New password *</Label>
                  <Input
                    id="rp-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                  />
                  {password.length > 0 && password.length < 8 && (
                    <div className="text-xs text-destructive">Password must be at least 8 characters.</div>
                  )}
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setResetTarget(null)} disabled={resetMutation.isPending}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={resetMutation.isPending || password.length < 8}>
                    {resetMutation.isPending ? "Saving…" : "Set password"}
                  </Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
