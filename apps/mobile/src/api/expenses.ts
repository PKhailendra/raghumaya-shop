import { useMutation, useQuery, useQueryClient, UseQueryResult } from '@tanstack/react-query';
import { api } from './client';
import { ListResponse } from './types';

export type ExpenseCategory = 'RENT' | 'SALARY' | 'UTILITIES' | 'SUPPLIES' | 'OTHER';

export interface ExpenseRecord {
  id: string;
  category: ExpenseCategory;
  categoryName: string;
  title: string;
  amount: string;
  expenseDate: string;
  paymentMode: string | null;
  paidBy: string | null;
  notes: string | null;
  createdAt: string;
}

export interface ExpenseSummary {
  year: number;
  month: number;
  breakdown: { category: string; categoryName: string; total: string; count: number }[];
  grandTotal: string;
  expenseCount: number;
}

export interface ExpenseFilters {
  category?: string;
  search?: string;
  fromDate?: string;
  toDate?: string;
}

export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: 'RENT', label: 'Rent' },
  { value: 'SALARY', label: 'Salary' },
  { value: 'UTILITIES', label: 'Utilities' },
  { value: 'SUPPLIES', label: 'Supplies' },
  { value: 'OTHER', label: 'Other' },
];

export const PAYMENT_MODES = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE'] as const;

export function useExpenses(filters: ExpenseFilters = {}): UseQueryResult<ListResponse<ExpenseRecord>> {
  const { category, search, fromDate, toDate } = filters;
  return useQuery({
    queryKey: ['expenses', category ?? '', search ?? '', fromDate ?? '', toDate ?? ''],
    queryFn: () =>
      api<ListResponse<ExpenseRecord>>('/expenses', {
        query: { category, search, fromDate, toDate, limit: 50 },
      }),
  });
}

export function useExpenseSummary(year: number, month: number): UseQueryResult<ExpenseSummary> {
  return useQuery({
    queryKey: ['expenses', 'summary', year, month],
    queryFn: () => api<ExpenseSummary>('/expenses/summary', { query: { year, month } }),
  });
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      category: string;
      title: string;
      amount: string;
      expenseDate: string;
      paidBy?: string;
      paymentMode?: string;
      notes?: string;
    }) => api<ExpenseRecord>('/expenses', { method: 'POST', body: payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
    },
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ deleted: boolean }>(`/expenses/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
    },
  });
}
