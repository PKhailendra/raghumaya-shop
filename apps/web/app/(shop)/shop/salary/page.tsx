"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { hrApi, shopsApi, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Can, useShop } from "@/lib/shop-context";
import { inr, toTitle } from "@/lib/format";
import { PageHeader, ErrorState, TableSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function ShopSalaryPage() {
  const { activeShopId } = useAuth();
  const { can } = useShop();
  const canSalaryManage = can("SALARY_MANAGE");
  const queryClient = useQueryClient();
  const [monthStr, setMonthStr] = useState(currentMonth());
  const [salaryFor, setSalaryFor] = useState<{ membershipId: string; name: string; current?: string } | null>(null);
  const [advanceFor, setAdvanceFor] = useState<{ membershipId: string; name: string } | null>(null);
  const [payFor, setPayFor] = useState<{ membershipId: string; name: string; net: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [year, month] = useMemo(() => {
    const [y, m] = monthStr.split("-").map(Number);
    if (!y || !m || m < 1 || m > 12) return [new Date().getFullYear(), new Date().getMonth() + 1];
    return [y, m];
  }, [monthStr]);

  const slips = useQuery({
    queryKey: ["shop", "salary", year, month],
    queryFn: () => hrApi.salarySlips({ month, year }),
    enabled: !!activeShopId && !!year && !!month,
  });

  const members = useQuery({
    queryKey: ["shop", "members"],
    queryFn: () => shopsApi.members(activeShopId!),
    enabled: !!activeShopId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["shop", "salary"] });
    queryClient.invalidateQueries({ queryKey: ["shop", "salary-payments"] });
    queryClient.invalidateQueries({ queryKey: ["shop", "advances"] });
    queryClient.invalidateQueries({ queryKey: ["shop", "salary-structure"] });
  };

  const rows = slips.data?.data ?? [];
  const paidDaysOf = (r: (typeof rows)[number]) => r.presentDays + r.halfDays * 0.5 + r.leaveDays;
  const totals = useMemo(
    () => ({
      net: rows.reduce((s, r) => s + Number(r.netPayable), 0),
      paid: rows.filter((r) => r.payment).length,
      pending: rows.filter((r) => !r.payment).length,
    }),
    [rows]
  );

  const staffOptions = useMemo(() => {
    const withSlip = new Set(rows.map((r) => r.member.membershipId));
    return (members.data ?? [])
      .filter((m) => (m.status === "ACTIVE" || !m.status) && m.role !== "OWNER")
      .map((m) => ({ value: m.id, label: `${m.name || "Staff"} (${toTitle(m.role)})`, hasSlip: withSlip.has(m.id) }));
  }, [members.data, rows]);

  const history = useQuery({
    queryKey: ["shop", "salary-payments"],
    queryFn: () => hrApi.salaryPayments(),
    enabled: !!activeShopId && canSalaryManage,
  });

  return (
    <div>
      <PageHeader
        title="Salary"
        description="Monthly salary computed from attendance, minus advances."
        actions={
          <div className="flex items-center gap-2">
            <Input type="month" value={monthStr} max={currentMonth()} onChange={(e) => setMonthStr(e.target.value)} className="w-40" />
          </div>
        }
      />

      {notice && (
        <div className="mb-4 rounded-md bg-blue-50 p-3 text-sm text-blue-800 flex justify-between items-center">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="text-blue-600 hover:text-blue-800">✕</button>
        </div>
      )}

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Total payable</div>
            <div className="text-xl font-bold">{inr(totals.net)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Paid</div>
            <div className="text-xl font-bold text-green-700">{totals.paid}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Pending</div>
            <div className="text-xl font-bold text-amber-600">{totals.pending}</div>
          </CardContent>
        </Card>
      </div>

      {slips.isLoading ? (
        <TableSkeleton />
      ) : slips.isError ? (
        <ErrorState
          message={slips.error instanceof ApiError ? slips.error.message : "Could not load salary data."}
          onRetry={() => slips.refetch()}
        />
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No salary records for {MONTHS[month - 1]} {year}. Set a monthly salary for staff to generate slips.
          </CardContent>
        </Card>
      ) : (
        <>
        {/* Desktop table */}
        <Card className="hidden md:block">
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead className="text-right">Monthly</TableHead>
                  <TableHead className="text-right">Paid days</TableHead>
                  <TableHead className="text-right">Advances</TableHead>
                  <TableHead className="text-right">Net payable</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.member.membershipId}>
                    <TableCell>
                      <div className="font-medium">{r.member.name || "Staff"}</div>
                      <div className="text-xs text-muted-foreground">{toTitle(r.member.role)}</div>
                    </TableCell>
                    <TableCell className="text-right">{inr(r.monthlySalary)}</TableCell>
                    <TableCell className="text-right">
                      {paidDaysOf(r).toFixed(1)} <span className="text-xs text-muted-foreground">/ {r.totalDays}</span>
                    </TableCell>
                    <TableCell className="text-right text-red-600">{Number(r.advances) > 0 ? `− ${inr(r.advances)}` : "−"}</TableCell>
                    <TableCell className="text-right font-semibold">{inr(r.netPayable)}</TableCell>
                    <TableCell>
                      <Badge variant={r.payment ? "success" : "warning"}>{r.payment ? "PAID" : "PENDING"}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Can any={["SALARY_MANAGE"]}>
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSalaryFor({ membershipId: r.member.membershipId, name: r.member.name || "Staff", current: r.monthlySalary })}
                          >
                            Salary
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setAdvanceFor({ membershipId: r.member.membershipId, name: r.member.name || "Staff" })}>
                            Advance
                          </Button>
                          {!r.payment && (
                            <Button size="sm" onClick={() => setPayFor({ membershipId: r.member.membershipId, name: r.member.name || "Staff", net: r.netPayable })}>
                              Pay
                            </Button>
                          )}
                        </div>
                      </Can>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Mobile cards */}
        <div className="md:hidden space-y-3">
          {rows.map((r) => (
            <Card key={r.member.membershipId}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-medium">{r.member.name || "Staff"}</div>
                    <div className="text-xs text-muted-foreground">{toTitle(r.member.role)}</div>
                  </div>
                  <Badge variant={r.payment ? "success" : "warning"}>{r.payment ? "PAID" : "PENDING"}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                  <div><span className="text-muted-foreground">Monthly: </span>{inr(r.monthlySalary)}</div>
                  <div><span className="text-muted-foreground">Paid days: </span>{paidDaysOf(r).toFixed(1)}/{r.totalDays}</div>
                  <div><span className="text-muted-foreground">Advances: </span><span className="text-red-600">{Number(r.advances) > 0 ? inr(r.advances) : "−"}</span></div>
                  <div><span className="text-muted-foreground">Net: </span><span className="font-semibold">{inr(r.netPayable)}</span></div>
                </div>
                <Can any={["SALARY_MANAGE"]}>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => setSalaryFor({ membershipId: r.member.membershipId, name: r.member.name || "Staff", current: r.monthlySalary })}>
                      Salary
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => setAdvanceFor({ membershipId: r.member.membershipId, name: r.member.name || "Staff" })}>
                      Advance
                    </Button>
                    {!r.payment && (
                      <Button size="sm" className="flex-1" onClick={() => setPayFor({ membershipId: r.member.membershipId, name: r.member.name || "Staff", net: r.netPayable })}>
                        Pay
                      </Button>
                    )}
                  </div>
                </Can>
              </CardContent>
            </Card>
          ))}
        </div>
        </>
      )}

      <Can any={["SALARY_MANAGE"]}>
        <Card className="mt-4">
          <CardContent className="p-4">
            <div className="mb-2 text-sm font-medium">Set monthly salary for staff</div>
            <StaffSalaryPicker
              options={staffOptions}
              onPick={(m) => setSalaryFor({ membershipId: m.value, name: m.label })}
            />
          </CardContent>
        </Card>
      </Can>

      {canSalaryManage && (history.data?.data?.length ?? 0) > 0 && (
        <Card className="mt-4">
          <CardContent className="p-0 overflow-x-auto">
            <div className="px-4 pt-4 text-sm font-medium">Payment history</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead>Staff</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Advances</TableHead>
                  <TableHead className="text-right">Bonus</TableHead>
                  <TableHead className="text-right">Deductions</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead>Mode</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(history.data?.data ?? []).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{MONTHS[p.month - 1]} {p.year}</TableCell>
                    <TableCell className="font-medium">{p.memberName}</TableCell>
                    <TableCell className="text-right">{inr(p.grossPayable)}</TableCell>
                    <TableCell className="text-right text-red-600">{Number(p.advances) > 0 ? `− ${inr(p.advances)}` : "−"}</TableCell>
                    <TableCell className="text-right text-green-700">{Number(p.bonus) > 0 ? `+ ${inr(p.bonus)}` : "−"}</TableCell>
                    <TableCell className="text-right text-red-600">{Number(p.deductions) > 0 ? `− ${inr(p.deductions)}` : "−"}</TableCell>
                    <TableCell className="text-right font-semibold">{inr(p.paidAmount)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.mode || "−"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {salaryFor && (
        <SalaryDialog
          membershipId={salaryFor.membershipId}
          name={salaryFor.name}
          current={salaryFor.current}
          onClose={() => setSalaryFor(null)}
          onDone={() => { setSalaryFor(null); invalidate(); }}
        />
      )}
      {advanceFor && (
        <AdvanceDialog
          membershipId={advanceFor.membershipId}
          name={advanceFor.name}
          onClose={() => setAdvanceFor(null)}
          onDone={() => { setAdvanceFor(null); invalidate(); }}
        />
      )}
      {payFor && (
        <PayDialog
          membershipId={payFor.membershipId}
          name={payFor.name}
          net={payFor.net}
          month={month}
          year={year}
          onClose={() => setPayFor(null)}
          onDone={(carried) => {
            setPayFor(null);
            invalidate();
            if (carried && Number(carried) > 0) {
              setNotice(`₹${carried} excess advance carried forward to next month.`);
            }
          }}
        />
      )}
    </div>
  );
}

function StaffSalaryPicker({ options, onPick }: { options: { value: string; label: string; hasSlip: boolean }[]; onPick: (o: { value: string; label: string }) => void }) {
  const [val, setVal] = useState("");
  return (
    <div className="flex gap-2">
      <Select value={val} onChange={setVal} placeholder="Select staff" options={[{ value: "", label: "Select staff" }, ...options]} />
      <Button
        onClick={() => {
          const o = options.find((x) => x.value === val);
          if (o) onPick(o);
        }}
        disabled={!val}
      >
        Set salary
      </Button>
    </div>
  );
}

function SalaryDialog({ membershipId, name, current, onClose, onDone }: { membershipId: string; name: string; current?: string; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState(current ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return setError("Enter a valid monthly salary.");
    setBusy(true);
    try {
      await hrApi.setSalaryStructure(membershipId, { monthlySalary: amount });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Monthly salary — {name}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="text-sm text-destructive">{error}</div>}
          <div className="space-y-2">
            <Label htmlFor="sal-amt">Monthly salary (₹)</Label>
            <Input id="sal-amt" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AdvanceDialog({ membershipId, name, onClose, onDone }: { membershipId: string; name: string; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const localToday = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const [advDate, setAdvDate] = useState(localToday());
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return setError("Enter a valid amount.");
    if (advDate > localToday()) return setError("Advance date cannot be in the future.");
    setBusy(true);
    try {
      await hrApi.recordAdvance({ membershipId, amount, advanceDate: advDate, notes: notes || undefined });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Salary advance — {name}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="text-sm text-destructive">{error}</div>}
          <div className="space-y-2">
            <Label htmlFor="adv-amt">Amount (₹)</Label>
            <Input id="adv-amt" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="adv-date">Date</Label>
            <Input id="adv-date" type="date" value={advDate} max={localToday()} onChange={(e) => {
              if (e.target.value <= localToday()) setAdvDate(e.target.value);
            }} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="adv-notes">Notes</Label>
            <Input id="adv-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Record advance"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PayDialog({ membershipId, name, net, month, year, onClose, onDone }: { membershipId: string; name: string; net: string; month: number; year: number; onClose: () => void; onDone: (carried?: string) => void }) {
  const [bonus, setBonus] = useState("");
  const [deductions, setDeductions] = useState("");
  const [mode, setMode] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const preview = Math.max(0, Number(net) + Number(bonus || 0) - Number(deductions || 0));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (bonus && Number(bonus) < 0) return setError("Bonus cannot be negative.");
    if (deductions && Number(deductions) < 0) return setError("Deductions cannot be negative.");
    setBusy(true);
    try {
      const res = await hrApi.paySalary({
        membershipId, month, year,
        bonus: bonus || undefined, deductions: deductions || undefined,
        mode: mode || undefined, notes: notes || undefined,
      });
      onDone(res.data?.carriedForward);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not record payment.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Pay salary — {name}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="text-sm text-destructive">{error}</div>}
          <div className="rounded-md bg-muted p-3 text-sm">
            Attendance-based net for {MONTHS[month - 1]} {year}: <span className="font-semibold">{inr(net)}</span>
            {(Number(bonus) > 0 || Number(deductions) > 0) && (
              <div className="mt-1">Payable after adjustments: <span className="font-semibold">{inr(preview)}</span></div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="pay-bonus">Bonus (₹)</Label>
              <Input id="pay-bonus" type="number" min="0" step="0.01" value={bonus} onChange={(e) => setBonus(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pay-ded">Deductions (₹)</Label>
              <Input id="pay-ded" type="number" min="0" step="0.01" value={deductions} onChange={(e) => setDeductions(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pay-mode">Payment mode</Label>
            <Select value={mode} onChange={setMode} placeholder="Select mode" options={[
              { value: "", label: "Select mode" },
              { value: "CASH", label: "Cash" },
              { value: "UPI", label: "UPI" },
              { value: "BANK_TRANSFER", label: "Bank transfer" },
            ]} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pay-notes">Notes</Label>
            <Input id="pay-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : `Pay ${inr(preview)}`}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
