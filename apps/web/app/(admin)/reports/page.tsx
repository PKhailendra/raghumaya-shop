"use client";

import { useState } from "react";
import { adminApi } from "@/lib/api";
import { PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Loader2 } from "lucide-react";

interface ReportDef {
  key: string;
  title: string;
  description: string;
  fetch: () => Promise<Record<string, unknown>[]>;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  const csv = toCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const flatten = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

const flatRows = (rows: Record<string, unknown>[]): Record<string, unknown>[] =>
  rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, flatten(v)])));

export default function ReportsPage() {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reports: ReportDef[] = [
    {
      key: "shops",
      title: "Shops",
      description: "All tenant shops on the platform.",
      fetch: async () => flatRows((await adminApi.shops({ limit: 1000 })).data),
    },
    {
      key: "users",
      title: "Users",
      description: "Platform accounts and their statuses.",
      fetch: async () => flatRows((await adminApi.users({ limit: 1000 })).data),
    },
    {
      key: "subscriptions",
      title: "Subscriptions",
      description: "Shop subscription assignments and statuses.",
      fetch: async () => flatRows((await adminApi.subscriptions({ limit: 1000 })).data),
    },
    {
      key: "audit-logs",
      title: "Audit logs",
      description: "Platform audit trail (last 1000 entries).",
      fetch: async () => flatRows((await adminApi.auditLogs({ limit: 1000 })).data),
    },
    {
      key: "revenue-by-plan",
      title: "Revenue by plan",
      description: "MRR breakdown by subscription plan.",
      fetch: async () => flatRows((await adminApi.revenueReport()).byPlan ?? []),
    },
  ];

  const run = async (r: ReportDef) => {
    setBusyKey(r.key);
    setError(null);
    try {
      const rows = await r.fetch();
      if (rows.length === 0) {
        setError(`No rows available for "${r.title}".`);
        return;
      }
      downloadCsv(`${r.key}-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not generate "${r.title}".`);
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div>
      <PageHeader title="Reports" description="Download platform reports as CSV. Generated from live data." />
      {error && <div className="mb-4 text-sm text-destructive">{error}</div>}
      <div className="grid gap-4 md:grid-cols-2">
        {reports.map((r) => (
          <Card key={r.key}>
            <CardHeader>
              <CardTitle>{r.title}</CardTitle>
              <CardDescription>{r.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => run(r)} disabled={busyKey !== null}>
                {busyKey === r.key ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                Download CSV
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
