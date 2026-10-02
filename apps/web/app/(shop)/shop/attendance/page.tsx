"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { hrApi, shopsApi, ApiError, type AttendanceStatus } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useShop, Can } from "@/lib/shop-context";
import { formatDate } from "@/lib/format";
import { PageHeader, ErrorState, TableSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";

const STATUS_OPTIONS: { value: AttendanceStatus; label: string; short: string }[] = [
  { value: "PRESENT", label: "Present", short: "P" },
  { value: "ABSENT", label: "Absent", short: "A" },
  { value: "HALF_DAY", label: "Half day", short: "H" },
  { value: "PAID_LEAVE", label: "Paid leave", short: "L" },
  { value: "WEEKLY_OFF", label: "Weekly off", short: "O" },
];

const STATUS_BADGE: Record<AttendanceStatus, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  HALF_DAY: "Half day",
  PAID_LEAVE: "Paid leave",
  WEEKLY_OFF: "Weekly off",
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function ShopAttendancePage() {
  const { activeShopId } = useAuth();
  const { can, membershipId } = useShop();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(todayStr());
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canMark = can("ATTENDANCE_MARK");

  const members = useQuery({
    queryKey: ["shop", "members"],
    queryFn: async () => (await shopsApi.members(activeShopId!)).filter((m) => m.role !== "OWNER"),
    enabled: !!activeShopId && canMark,
  });

  const records = useQuery({
    queryKey: ["shop", "attendance", date],
    queryFn: () => hrApi.attendance({ date }),
    enabled: !!activeShopId,
  });

  // Seed local marks from fetched records whenever date/data changes.
  useEffect(() => {
    const seed: Record<string, AttendanceStatus> = {};
    for (const d of records.data?.data ?? []) {
      const rec = d.records[0];
      if (rec) seed[d.member.membershipId] = rec.status;
    }
    setMarks(seed);
    setSaved(null);
  }, [records.data, date]);

  const save = useMutation({
    mutationFn: () =>
      hrApi.markAttendance({
        date,
        records: Object.entries(marks).map(([membershipId, status]) => ({ membershipId, status })),
      }),
    onSuccess: () => {
      setSaved("Attendance saved.");
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["shop", "attendance"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not save attendance."),
  });

  const markAll = (status: AttendanceStatus) => {
    const all: Record<string, AttendanceStatus> = {};
    for (const m of members.data ?? []) all[m.id] = status;
    setMarks(all);
  };

  const rows = useMemo(() => {
    if (canMark) return members.data ?? [];
    // Non-marking staff see their own record.
    const day = (records.data?.data ?? [])[0];
    return day?.member
      ? [{ id: day.member.membershipId, name: day.member.name || "You", role: day.member.role, phone: day.member.phone }]
      : [];
  }, [canMark, members.data, records.data, membershipId]);

  const markedCount = Object.keys(marks).length;

  return (
    <div>
      <PageHeader
        title="Attendance"
        description="Daily staff attendance. Salary is calculated from these marks."
        actions={
          canMark && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => markAll("PRESENT")}>
                <Check className="h-4 w-4 mr-1" /> All present
              </Button>
              <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || markedCount === 0}>
                {save.isPending ? "Saving…" : `Save (${markedCount})`}
              </Button>
            </div>
          )
        }
      />

      {error && <div className="mb-4 text-sm text-destructive">{error}</div>}
      {saved && <div className="mb-4 text-sm text-green-700">{saved}</div>}

      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="max-w-xs space-y-1">
            <Label htmlFor="att-date">Date</Label>
            <Input id="att-date" type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {records.isLoading || members.isLoading ? (
        <TableSkeleton />
      ) : records.isError ? (
        <ErrorState
          message={records.error instanceof ApiError ? records.error.message : "Could not load attendance."}
          onRetry={() => records.refetch()}
        />
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No attendance {canMark ? "records" : "record"} for {formatDate(date)}.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((m) => {
            const current = marks[m.id];
            return (
              <Card key={m.id}>
                <CardContent className="p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{m.name || "Staff"}</div>
                      <div className="text-xs text-muted-foreground">{m.role}</div>
                    </div>
                    {current && !canMark && <Badge>{STATUS_BADGE[current]}</Badge>}
                  </div>
                  {canMark ? (
                    <div className="grid grid-cols-5 gap-1">
                      {STATUS_OPTIONS.map((o) => (
                        <button
                          key={o.value}
                          type="button"
                          title={o.label}
                          onClick={() => setMarks((p) => ({ ...p, [m.id]: o.value }))}
                          className={`rounded-md border px-1 py-2 text-xs font-semibold transition-colors ${
                            current === o.value
                              ? o.value === "PRESENT"
                                ? "border-green-600 bg-green-600 text-white"
                                : o.value === "ABSENT"
                                  ? "border-red-600 bg-red-600 text-white"
                                  : "border-amber-500 bg-amber-500 text-white"
                              : "bg-background text-muted-foreground hover:border-foreground/30"
                          }`}
                        >
                          {o.short}
                          <span className="mt-0.5 block text-[10px] font-normal leading-tight">{o.label}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    !current && <div className="text-xs text-muted-foreground">Not marked yet.</div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Can any={["ATTENDANCE_MARK"]}>
        <div className="sticky bottom-4 mt-4 flex justify-end pb-16">
          <Button size="lg" onClick={() => save.mutate()} disabled={save.isPending || markedCount === 0} className="shadow-lg">
            {save.isPending ? "Saving…" : `Save attendance (${markedCount})`}
          </Button>
        </div>
      </Can>
    </div>
  );
}
