import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { api } from './client';
import { AnalyticsDashboard, DailySale, TopProduct } from './types';

interface RawDashboard {
  summary?: { totalSales?: string | number };
  salesChart?: { series?: { period?: string; sales?: string | number }[] };
  inventoryInsights?: { totalProducts?: number; lowStock?: number };
  customerInsights?: { totalCustomers?: number };
  paymentAnalysis?: { outstanding?: { amount?: string | number } };
}

export function useDashboard(): UseQueryResult<AnalyticsDashboard> {
  return useQuery({
    queryKey: ['analytics', 'dashboard'],
    queryFn: async () => {
      const raw = await api<RawDashboard>('/analytics/dashboard');
      const series = raw.salesChart?.series ?? [];
      const last = series[series.length - 1] ?? {};
      return {
        todaySales: String(last.sales ?? '0'),
        monthSales: String(raw.summary?.totalSales ?? '0'),
        totalOutstanding: String(raw.paymentAnalysis?.outstanding?.amount ?? '0'),
        lowStockCount: raw.inventoryInsights?.lowStock ?? 0,
        totalProducts: raw.inventoryInsights?.totalProducts ?? 0,
        totalCustomers: raw.customerInsights?.totalCustomers ?? 0,
      };
    },
  });
}

interface RawChartPoint {
  period?: string;
  sales?: string | number;
}

export function useDailySales(from: string, to: string): UseQueryResult<DailySale[]> {
  return useQuery({
    queryKey: ['analytics', 'sales-daily', from, to],
    // NOTE: /analytics/sales/daily does not exist — /analytics/sales-chart is the real endpoint
    queryFn: async () => {
      const raw = await api<{ series?: RawChartPoint[] } | RawChartPoint[]>(
        '/analytics/sales-chart',
        { query: { groupBy: 'day' } },
      );
      const series = Array.isArray(raw) ? raw : (raw.series ?? []);
      return series.map((p) => ({
        date: p.period ?? '',
        total: String(p.sales ?? '0'),
      }));
    },
  });
}

interface RawTopProduct {
  productId?: string;
  productName?: string;
  description?: string;
  quantity?: string | number;
  revenue?: string | number;
}

export function useTopProducts(limit = 5): UseQueryResult<TopProduct[]> {
  return useQuery({
    queryKey: ['analytics', 'top-products', limit],
    queryFn: async () => {
      // API returns a plain array (not a ListResponse wrapper)
      const raw = await api<{ data?: RawTopProduct[] } | RawTopProduct[]>(
        '/analytics/top-products',
        { query: { limit } },
      );
      const list = Array.isArray(raw) ? raw : (raw.data ?? []);
      return list.map((p) => ({
        productId: p.productId ?? '',
        productName: p.productName ?? p.description ?? 'Unknown product',
        quantity: String(p.quantity ?? '0'),
        revenue: String(p.revenue ?? '0'),
      }));
    },
  });
}
