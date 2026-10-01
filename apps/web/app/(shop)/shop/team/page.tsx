"use client";

import type React from "react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { shopsApi, ApiError, type ShopMember } from "@/lib/api";
import { formatDateTime, toTitle } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { PageHeader, ErrorState, EmptyState, TableSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Plus, Trash2 } from "lucide-react";
import { SHOP_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } from "@raghumaya/shared";

const ROLES = ["OWNER", "MANAGER", "CASHIER", "ACCOUNTANT", "INVENTORY_STAFF", "STAFF"];

export default function ShopTeamPage() {
  const { activeShopId } = useAuth();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editor, setEditor] = useState<ShopMember | null>(null);
  const [removeTarget, setRemoveTarget] = useState<ShopMember | null>(null);
  const queryClient = useQueryClient();

  const members = useQuery({
    queryKey: ["shop", "members", activeShopId],
    queryFn: () => shopsApi.members(activeShopId!),
    enabled: !!activeShopId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["shop", "members"] });

  const removeMutation = useMutation({
    mutationFn: (id: string) => shopsApi.removeMember(activeShopId!, id),
    onSuccess: invalidate,
  });

  const rows = (members.data ?? []) as ShopMember[];

  return (
    <div>
      <PageHeader
        title="Team"
        description="Invite staff and manage roles and permissions."
        actions={
          <Button onClick={() => setInviteOpen(true)}>
            <Plus className="h-4 w-4" /> Invite member
          </Button>
        }
      />

      {members.isLoading ? (
        <TableSkeleton />
      ) : members.isError ? (
        <ErrorState
          message={members.error instanceof ApiError ? members.error.message : "Could not load team members."}
          onRetry={() => members.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No team members"
          description="Invite staff to help run your shop."
          action={<Button onClick={() => setInviteOpen(true)}><Plus className="h-4 w-4" /> Invite member</Button>}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell>{m.email ?? m.phone ?? "-"}</TableCell>
                    <TableCell>
                      <Badge variant={m.role === "OWNER" ? "default" : "secondary"}>{toTitle(m.role)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={m.status === "ACTIVE" ? "success" : "warning"}>{toTitle(m.status)}</Badge>
                    </TableCell>
                    <TableCell>{formatDateTime(m.joinedAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {m.role !== "OWNER" && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => setEditor(m)}>Edit role</Button>
                            <Button size="sm" variant="destructive" onClick={() => setRemoveTarget(m)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
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

      {inviteOpen && (
        <InviteDialog
          onClose={() => setInviteOpen(false)}
          onDone={() => { setInviteOpen(false); invalidate(); }}
        />
      )}
      {editor && (
        <RoleEditor
          member={editor}
          onClose={() => setEditor(null)}
          onDone={() => { setEditor(null); invalidate(); }}
        />
      )}
      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(v) => !v && setRemoveTarget(null)}
        title="Remove member"
        description={`Remove ${removeTarget?.name} from this shop?`}
        confirmLabel="Remove"
        destructive
        busy={removeMutation.isPending}
        onConfirm={() => { void removeMutation.mutateAsync(removeTarget!.id); }}
      />
    </div>
  );
}

function PermissionChecklist({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (perm: string) => {
    onChange(value.includes(perm) ? value.filter((p) => p !== perm) : [...value, perm]);
  };
  return (
    <div className="grid max-h-56 grid-cols-2 gap-1 overflow-y-auto rounded-md border p-3 sm:grid-cols-3">
      {SHOP_PERMISSIONS.map((perm) => (
        <label key={perm} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-muted">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-primary"
            checked={value.includes(perm)}
            onChange={() => toggle(perm)}
          />
          <span className="truncate" title={perm}>{toTitle(perm)}</span>
        </label>
      ))}
    </div>
  );
}

function InviteDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { activeShopId } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("STAFF");
  const [permissions, setPermissions] = useState<string[]>([...(DEFAULT_ROLE_PERMISSIONS.STAFF as readonly string[])]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const changeRole = (r: string) => {
    setRole(r);
    setPermissions([...((DEFAULT_ROLE_PERMISSIONS as Record<string, readonly string[]>)[r] ?? [])]);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Name is required.");
    if (phone.trim().length < 7) return setError("A valid phone number is required.");
    if (!activeShopId) return setError("Select a shop first.");
    setBusy(true);
    try {
      await shopsApi.inviteMember(activeShopId, {
        fullName: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim(),
        role,
        permissions,
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send the invite.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite team member</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="text-sm text-destructive">{error}</div>}
          <div className="space-y-2">
            <Label htmlFor="tm-name">Name *</Label>
            <Input id="tm-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tm-email">Email</Label>
              <Input id="tm-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tm-phone">Phone *</Label>
              <Input id="tm-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onChange={changeRole} options={ROLES.filter((r) => r !== "OWNER").map((r) => ({ value: r, label: toTitle(r) }))} />
            <p className="text-xs text-muted-foreground">Changing the role resets the permissions below to that role&apos;s defaults.</p>
          </div>
          <div className="space-y-2">
            <Label>Permissions ({permissions.length} selected)</Label>
            <PermissionChecklist value={permissions} onChange={setPermissions} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Inviting…" : "Send invite"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RoleEditor({ member, onClose, onDone }: { member: ShopMember; onClose: () => void; onDone: () => void }) {
  const { activeShopId } = useAuth();
  const [role, setRole] = useState(member.role);
  const [permissions, setPermissions] = useState<string[]>(member.permissions ?? []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const changeRole = (r: string) => {
    setRole(r);
    setPermissions([...((DEFAULT_ROLE_PERMISSIONS as Record<string, readonly string[]>)[r] ?? [])]);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!activeShopId) return;
    setBusy(true);
    try {
      await shopsApi.updateMember(activeShopId, member.id, { role, permissions });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update the role.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit role — {member.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="text-sm text-destructive">{error}</div>}
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onChange={changeRole} options={ROLES.filter((r) => r !== "OWNER").map((r) => ({ value: r, label: toTitle(r) }))} />
            <p className="text-xs text-muted-foreground">Changing the role resets the permissions below to that role&apos;s defaults.</p>
          </div>
          <div className="space-y-2">
            <Label>Permissions ({permissions.length} selected)</Label>
            <PermissionChecklist value={permissions} onChange={setPermissions} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
