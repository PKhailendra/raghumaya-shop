import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { api } from './client';
import { Category, ListResponse, Product } from './types';

export interface ProductFilters {
  search?: string;
  categoryId?: string;
  page?: number;
  limit?: number;
}

export function useProducts(filters: ProductFilters = {}): UseQueryResult<ListResponse<Product>> {
  const { search, categoryId, page = 1, limit = 20 } = filters;
  return useQuery({
    queryKey: ['products', search ?? '', categoryId ?? '', page],
    queryFn: () =>
      api<ListResponse<Product>>('/inventory/products', {
        query: { search, categoryId, page, limit },
      }),
  });
}

export function useProduct(id: string): UseQueryResult<Product> {
  return useQuery({
    queryKey: ['products', id],
    queryFn: () => api<Product>(`/inventory/products/${id}`),
    enabled: !!id,
  });
}

export function useProductLookup(
  type: 'barcode' | 'qr',
  code: string,
): UseQueryResult<Product> {
  return useQuery({
    queryKey: ['product-lookup', type, code],
    queryFn: () =>
      api<Product>('/inventory/products/lookup', { query: { type, code } }),
    enabled: code.length > 0,
  });
}

export function useCategories(): UseQueryResult<ListResponse<Category>> {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => api<ListResponse<Category>>('/inventory/categories'),
  });
}
