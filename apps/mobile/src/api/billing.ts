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

/**
 * Map the raw API invoice shape to the mobile Invoice type.
 * API uses `totalAmount`; mobile UI expects `grandTotal` and `balanceDue`.
 */
function mapInvoice(raw: any): Invoice {
  const total = raw.totalAmount ?? raw.grandTotal ?? '0';
  const paid = raw.paidAmount ?? '0';
  const balance =
    raw.balanceDue ??
    (isNaN(Number(total)) || isNaN(Number(paid)) ? '0' : String(Number(total) - Number(paid)));
  return {
    ...raw,
    issueDate: raw.issueDate ?? raw.invoiceDate,
    grandTotal: String(total),
    paidAmount: String(paid),
    balanceDue: String(balance),
  };
}

function mapInvoiceList(raw: any): ListResponse<Invoice> {
  return {
    ...raw,
    data: (raw.data ?? []).map(mapInvoice),
  };
}

export function useInvoices(filters: InvoiceFilters = {}): UseQueryResult<ListResponse<Invoice>> {
  const { search, status, page = 1 } = filters;
  return useQuery({
    queryKey: ['invoices', search ?? '', status ?? '', page],
    queryFn: () =>
      api<any>('/billing/invoices', {
        query: { search, status, page },
      }).then(mapInvoiceList),
  });
}

export function useInvoice(id: string): UseQueryResult<Invoice> {
  return useQuery({
    queryKey: ['invoices', id],
    queryFn: () => api<any>(`/billing/invoices/${id}`).then(mapInvoice),
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

export function useCancelInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<Invoice>(`/billing/invoices/${id}`, {
        method: 'PATCH',
        body: { status: 'CANCELLED' },
      }).then(mapInvoice),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['invoices', id] });
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
