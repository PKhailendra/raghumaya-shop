import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { api } from './client';
import { AnalyticsDashboard, DailySale, ListResponse, TopProduct } from './types';

export function useDashboard(): UseQueryResult<AnalyticsDashboard> {
  return useQuery({
    queryKey: ['analytics', 'dashboard'],
    queryFn: () => api<AnalyticsDashboard>('/analytics/dashboard'),
  });
}

export function useDailySales(from: string, to: string): UseQueryResult<DailySale[]> {
  return useQuery({
    queryKey: ['analytics', 'sales-daily', from, to],
    queryFn: () => api<DailySale[]>('/analytics/sales/daily', { query: { fromDate: from, toDate: to } }),
  });
}

export function useTopProducts(limit = 5): UseQueryResult<ListResponse<TopProduct>> {
  return useQuery({
    queryKey: ['analytics', 'top-products', limit],
    queryFn: () => api<ListResponse<TopProduct>>('/analytics/top-products', { query: { limit } }),
  });
}
