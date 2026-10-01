"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

const COLORS = ["#1e3a5f", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

export function SimpleLineChart({ data, xKey, lines }: { data: unknown[]; xKey: string; lines: { key: string; name?: string; color?: string }[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data as never[]} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey={xKey} fontSize={12} />
        <YAxis fontSize={12} />
        <Tooltip />
        <Legend />
        {lines.map((l, i) => (
          <Line key={l.key} type="monotone" dataKey={l.key} name={l.name ?? l.key} stroke={l.color ?? COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function SimpleAreaChart({ data, xKey, dataKey, name }: { data: unknown[]; xKey: string; dataKey: string; name?: string }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data as never[]} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey={xKey} fontSize={12} />
        <YAxis fontSize={12} />
        <Tooltip />
        <Area type="monotone" dataKey={dataKey} name={name ?? dataKey} stroke={COLORS[0]} fill={COLORS[1]} fillOpacity={0.35} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function SimpleBarChart({ data, xKey, dataKey, name }: { data: unknown[]; xKey: string; dataKey: string; name?: string }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data as never[]} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey={xKey} fontSize={12} />
        <YAxis fontSize={12} />
        <Tooltip />
        <Bar dataKey={dataKey} name={name ?? dataKey} fill={COLORS[0]} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SimpleDonut({ data, labelKey, valueKey }: { data: unknown[]; labelKey: string; valueKey: string }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie data={data as never[]} dataKey={valueKey} nameKey={labelKey} innerRadius={60} outerRadius={100} paddingAngle={3}>
          {(data as Record<string, unknown>[]).map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
