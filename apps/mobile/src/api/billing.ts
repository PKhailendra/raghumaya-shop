import { useMutation, useQuery, useQueryClient, UseQueryResult } from '@tanstack/react-query';
import { api } from './client';
import {
  CreateInvoicePayload,
  Invoice,
  ListResponse,
  Payment,
} from './types';

export interface InvoiceFilters {
  search?: string;
  status?: string;
  page?: number;
}

export function useInvoices(filters: InvoiceFilters = {}): UseQueryResult<ListResponse<Invoice>> {
  const { search, status, page = 1 } = filters;
  return useQuery({
    queryKey: ['invoices', search ?? '', status ?? '', page],
    queryFn: () =>
      api<ListResponse<Invoice>>('/billing/invoices', {
        query: { search, status, page },
      }),
  });
}

export function useInvoice(id: string): UseQueryResult<Invoice> {
  return useQuery({
    queryKey: ['invoices', id],
    queryFn: () => api<Invoice>(`/billing/invoices/${id}`),
    enabled: !!id,
  });
}

export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateInvoicePayload) =>
      api<Invoice>('/billing/invoices', {
        method: 'POST',
        body: payload,
        idempotencyKey: `inv-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['analytics'] });
    },
  });
}

export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      invoiceId?: string;
      customerId?: string;
      amount: string;
      mode: string;
      direction?: 'IN' | 'OUT';
    }) =>
      api<Payment>('/billing/payments', {
        method: 'POST',
        body: payload,
        idempotencyKey: `pay-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['analytics'] });
    },
  });
}

export function useInvoiceWhatsappLink(id: string) {
  return useMutation({
    mutationFn: () => api<{ url: string }>(`/billing/invoices/${id}/whatsapp-link`, { method: 'POST' }),
  });
}

export function useInvoiceSmsLink(id: string) {
  return useMutation({
    mutationFn: () => api<{ url: string }>(`/billing/invoices/${id}/sms-link`, { method: 'POST' }),
  });
}
