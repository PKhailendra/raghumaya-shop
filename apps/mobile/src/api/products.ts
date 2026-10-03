import { useMutation, useQuery, useQueryClient, UseQueryResult } from '@tanstack/react-query';
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
      api<{ product: Product; variant?: unknown }>('/inventory/products/lookup', {
        query: { type, code },
      }).then((res) => res.product),
    enabled: code.length > 0,
  });
}

export function useCategories(): UseQueryResult<ListResponse<Category>> {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => api<ListResponse<Category>>('/inventory/categories'),
  });
}

export function useBrands(): UseQueryResult<ListResponse<{ id: string; name: string }>> {
  return useQuery({
    queryKey: ['brands'],
    queryFn: () => api<ListResponse<{ id: string; name: string }>>('/inventory/brands'),
  });
}

export interface ProductInput {
  name: string;
  sku?: string;
  barcode?: string;
  qrCode?: string;
  categoryId?: string;
  brandId?: string;
  description?: string;
  unit?: string;
  purchasePrice?: string;
  sellingPrice: string;
  mrp?: string;
  gstRate?: string;
  taxRate?: string;
  hsnCode?: string;
  currentStock?: string;
  minStockLevel?: string;
  reorderLevel?: string;
  isActive?: boolean;
  images?: { url: string; isPrimary?: boolean; sortOrder?: number }[];
  variants?: {
    name: string;
    sku?: string;
    barcode?: string;
    qrCode?: string;
    purchasePrice?: string;
    sellingPrice?: string;
    currentStock?: string;
    reorderLevel?: string;
  }[];
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProductInput) =>
      api<Product>('/inventory/products', { method: 'POST', body: payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<ProductInput> }) =>
      api<Product>(`/inventory/products/${id}`, { method: 'PATCH', body: payload }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['products', vars.id] });
    },
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<{ ok: boolean }>(`/inventory/products/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}
