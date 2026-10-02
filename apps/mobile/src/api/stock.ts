import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { api } from './client';
import { ListResponse, LowStockAlert, StockLevel, StockMovement } from './types';

export function useStockLevels(page = 1): UseQueryResult<ListResponse<StockLevel>> {
  return useQuery({
    queryKey: ['stock', 'levels', page],
    queryFn: () => api<ListResponse<StockLevel>>('/stock/levels', { query: { page } }),
  });
}

export function useStockMovements(page = 1): UseQueryResult<ListResponse<StockMovement>> {
  return useQuery({
    queryKey: ['stock', 'movements', page],
    queryFn: () =>
      api<ListResponse<StockMovement>>('/stock/movements', { query: { page } }),
  });
}

export function useLowStockAlerts(): UseQueryResult<LowStockAlert[]> {
  return useQuery({
    queryKey: ['stock', 'alerts', 'low-stock'],
    queryFn: async () => {
      const res = await api<{ data: LowStockAlert[] } | LowStockAlert[]>('/stock/alerts/low-stock');
      return Array.isArray(res) ? res : (res.data ?? []);
    },
  });
}

export function useOutOfStockAlerts(): UseQueryResult<LowStockAlert[]> {
  return useQuery({
    queryKey: ['stock', 'alerts', 'out-of-stock'],
    queryFn: async () => {
      const res = await api<{ data: LowStockAlert[] } | LowStockAlert[]>('/stock/alerts/out-of-stock');
      return Array.isArray(res) ? res : (res.data ?? []);
    },
  });
}
