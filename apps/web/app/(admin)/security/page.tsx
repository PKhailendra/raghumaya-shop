"use client";

import { useQuery } from "@tanstack/react-query";
import { adminApi, ApiError } from "@/lib/api";
import { formatDateTime, toTitle } from "@/lib/format";
import { PageHeader, ErrorState, EmptyState, TableSkeleton } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AdminSecurityPage() {
  const loginHistory = useQuery({
    queryKey: ["admin", "security", "login-history"],
    queryFn: () => adminApi.loginHistory({ page: 1, limit: 50 }),
  });
  const devices = useQuery({
    queryKey: ["admin", "security", "devices"],
    queryFn: () => adminApi.securityDevices({ page: 1, limit: 50 }),
  });

  return (
    <div>
      <PageHeader title="Security" description="Login history and registered devices across the platform." />

      <Tabs defaultValue="logins">
        <TabsList>
          <TabsTrigger value="logins">Login history</TabsTrigger>
          <TabsTrigger value="devices">Devices</TabsTrigger>
        </TabsList>

        <TabsContent value="logins">
          {loginHistory.isLoading ? (
            <TableSkeleton />
          ) : loginHistory.isError ? (
            <ErrorState
              message={loginHistory.error instanceof ApiError ? loginHistory.error.message : "Could not load login history."}
              onRetry={() => loginHistory.refetch()}
            />
          ) : (loginHistory.data?.data ?? []).length === 0 ? (
            <EmptyState title="No login records" />
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Result</TableHead>
                      <TableHead>IP</TableHead>
                      <TableHead>Device</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(loginHistory.data?.data ?? []).map((r, i) => {
                      const row = r as unknown as { action?: string; success?: boolean; email?: string; accountId?: string; ipAddress?: string; userAgent?: string; createdAt?: string };
                      const success = row.action ? row.action === "LOGIN" : row.success !== false;
                      const label = row.action
                        ? row.action === "LOGIN"
                          ? "Success"
                          : row.action === "LOGIN_FAILED"
                            ? "Failed"
                            : toTitle(row.action)
                        : success
                          ? "Success"
                          : "Failed";
                      return (
                        <TableRow key={i}>
                          <TableCell className="whitespace-nowrap text-xs">{formatDateTime(String(row.createdAt ?? ""))}</TableCell>
                          <TableCell>{String(row.email ?? row.accountId ?? "-")}</TableCell>
                          <TableCell>
                            <Badge variant={success ? "success" : row.action === "LOGOUT" ? "secondary" : "destructive"}>{label}</Badge>
                          </TableCell>
                          <TableCell className="text-xs">{String(row.ipAddress ?? "-")}</TableCell>
                          <TableCell className="text-xs max-w-xs truncate">{String(row.userAgent ?? "-")}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="devices">
          {devices.isLoading ? (
            <TableSkeleton />
          ) : devices.isError ? (
            <ErrorState
              message={devices.error instanceof ApiError ? devices.error.message : "Could not load devices."}
              onRetry={() => devices.refetch()}
            />
          ) : (devices.data?.data ?? []).length === 0 ? (
            <EmptyState title="No devices" />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(devices.data?.data ?? []).map((d) => (
                <Card key={d.id}>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      {d.deviceName}
                      {d.deviceType && d.deviceType !== "desktop" && (
                        <Badge variant="secondary" className="text-[10px]">{toTitle(d.deviceType)}</Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-1">
                    <div className="text-muted-foreground">
                      {[d.browser, d.platform].filter(Boolean).join(" • ") || d.deviceType || "Unknown device"}
                    </div>
                    <div className="text-xs text-muted-foreground">IP: {d.ipAddress ?? "-"}</div>
                    <div className="text-xs text-muted-foreground">Last used: {formatDateTime(d.lastUsedAt)}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
