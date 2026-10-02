import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { api } from './client';

export interface DailyClosing {
  date: string;
  sales: {
    totalSales: string;
    invoiceCount: number;
    byStatus: { status: string; count: number; amount: string }[];
    averageOrderValue: string;
  };
  collections: {
    totalCollected: string;
    byMode: { mode: string; count: number; amount: string }[];
  };
  credit: { newDue: string; dueInvoiceCount: number };
  expenses: { totalExpenses: string; count: number };
  salary: { salaryPaid: string; count: number };
  cash: { netCash: string; note: string };
  topProducts: { productId: string | null; description: string; quantity: string; revenue: string }[];
  invoices: {
    id: string;
    invoiceNumber: string;
    customerName: string | null;
    status: string;
    totalAmount: string;
    paidAmount: string;
    balanceAmount: string;
    issueDate: string;
  }[];
}

export function useDailyClosing(date: string): UseQueryResult<DailyClosing> {
  return useQuery({
    queryKey: ['reports', 'daily-closing', date],
    queryFn: () => api<DailyClosing>('/reports/daily-closing', { query: { date } }),
    enabled: !!date,
  });
}
