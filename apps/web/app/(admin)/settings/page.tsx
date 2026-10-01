"use client";

import type React from "react";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { adminApi, ApiError } from "@/lib/api";
import { PageHeader, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";

type SettingField = { key: string; label: string; type: "text" | "number"; hint?: string };

const SETTINGS_GROUPS: { title: string; fields: SettingField[] }[] = [
  {
    title: "Platform",
    fields: [
      { key: "platformName", label: "Platform name", type: "text" },
      { key: "supportEmail", label: "Support email", type: "text" },
      { key: "supportPhone", label: "Support phone", type: "text" },
    ],
  },
  {
    title: "Notifications",
    fields: [
      { key: "smsEnabled", label: "SMS enabled (true/false)", type: "text" },
      { key: "emailEnabled", label: "Email enabled (true/false)", type: "text" },
    ],
  },
  {
    title: "Limits",
    fields: [
      { key: "defaultTrialDays", label: "Default trial days", type: "number" },
      { key: "maxLoginAttempts", label: "Max login attempts", type: "number" },
    ],
  },
];

export default function AdminSettingsPage() {
  const query = useQuery({
    queryKey: ["admin", "settings"],
    queryFn: () => adminApi.settings(),
  });

  const [values, setValues] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => adminApi.updateSettings(body),
    onSuccess: () => {
      setSaved(true);
      query.refetch();
      setTimeout(() => setSaved(false), 3000);
    },
  });

  if (query.isLoading) {
    return (
      <div>
        <PageHeader title="Platform settings" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div>
        <PageHeader title="Platform settings" />
        <ErrorState
          message={query.error instanceof ApiError ? query.error.message : "Could not load settings."}
          onRetry={() => query.refetch()}
        />
      </div>
    );
  }

  const current = { ...(query.data as Record<string, unknown>), ...values };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    await mutation.mutateAsync(values);
  };

  return (
    <div>
      <PageHeader title="Platform settings" description="Only super admins can change these." />
      {saved && <Alert variant="success" className="mb-4">Settings saved.</Alert>}
      {mutation.isError && (
        <Alert variant="error" className="mb-4">
          {mutation.error instanceof ApiError ? mutation.error.message : "Could not save settings."}
        </Alert>
      )}
      <form onSubmit={save} className="space-y-6 max-w-2xl">
        {SETTINGS_GROUPS.map((group) => (
          <Card key={group.title}>
            <CardHeader>
              <CardTitle>{group.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {group.fields.map((f) => (
                <div key={f.key} className="space-y-2">
                  <Label htmlFor={f.key}>{f.label}</Label>
                  <Input
                    id={f.key}
                    type={f.type === "number" ? "number" : "text"}
                    value={String(current[f.key] ?? "")}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save settings"}
        </Button>
      </form>
    </div>
  );
}
