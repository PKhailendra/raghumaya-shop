import { useMutation, useQuery, useQueryClient, UseQueryResult } from '@tanstack/react-query';
import { api } from './client';
import { Customer, CustomerLedger, Invoice, ListResponse } from './types';

export interface CustomerFilters {
  search?: string;
  page?: number;
}

export function useCustomers(filters: CustomerFilters = {}): UseQueryResult<ListResponse<Customer>> {
  const { search, page = 1 } = filters;
  return useQuery({
    queryKey: ['customers', search ?? '', page],
    queryFn: () =>
      api<ListResponse<Customer>>('/customers', { query: { search, page } }),
  });
}

export function useCustomer(id: string): UseQueryResult<Customer> {
  return useQuery({
    queryKey: ['customers', id],
    queryFn: () => api<Customer>(`/customers/${id}`),
    enabled: !!id,
  });
}

export function useDuePayments(): UseQueryResult<Invoice[]> {
  return useQuery({
    queryKey: ['customers', 'due-payments'],
    queryFn: async () => {
      const res = await api<{ data: Invoice[] } | Invoice[]>('/customers/due-payments');
      return Array.isArray(res) ? res : (res.data ?? []);
    },
  });
}

export function useCustomerLedger(id: string): UseQueryResult<CustomerLedger> {
  return useQuery({
    queryKey: ['customers', id, 'ledger'],
    queryFn: () => api<CustomerLedger>(`/customers/${id}/ledger`),
    enabled: !!id,
  });
}

export function useCustomerInvoices(id: string): UseQueryResult<Invoice[]> {
  return useQuery({
    queryKey: ['customers', id, 'invoices'],
    queryFn: async () => {
      const res = await api<{ data: Invoice[] } | Invoice[]>(`/customers/${id}/purchases`);
      return Array.isArray(res) ? res : (res.data ?? []);
    },
    enabled: !!id,
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      name: string;
      phone?: string;
      email?: string;
      address?: string;
      gstNumber?: string;
    }) => api<Customer>('/customers', { method: 'POST', body: payload }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
}

export function useSmsReminder(customerId: string) {
  return useMutation({
    mutationFn: (message?: string) =>
      api(`/customers/${customerId}/reminders/sms`, {
        method: 'POST',
        body: message ? { message } : {},
      }),
  });
}

export function useWhatsappReminder(customerId: string) {
  return useMutation({
    mutationFn: (message?: string) =>
      api<{ url: string }>(`/customers/${customerId}/reminders/whatsapp`, {
        method: 'POST',
        body: message ? { message } : {},
      }),
  });
}
