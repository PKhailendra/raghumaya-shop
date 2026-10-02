import { useMutation, useQuery, useQueryClient, UseQueryResult } from '@tanstack/react-query';
import { api } from './client';
import { ListResponse } from './types';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'PAID_LEAVE' | 'WEEKLY_OFF';

export interface HrMember {
  membershipId: string;
  name: string;
  role: string;
  phone?: string | null;
}

export interface AttendanceRecord {
  id: string;
  date: string;
  status: AttendanceStatus;
  notes?: string | null;
}

export interface AttendanceDay {
  member: HrMember;
  records: AttendanceRecord[];
}

export interface SalaryStructure {
  id: string;
  membershipId: string;
  monthlySalary: string;
  effectiveFrom: string;
}

export interface SalarySlipPayment {
  id: string;
  status: string;
  paidAmount: string;
  paidAt: string | null;
  mode: string | null;
}

export interface SalarySlip {
  member: HrMember;
  year: number;
  month: number;
  monthlySalary: string;
  totalDays: number;
  presentDays: number;
  absentDays: number;
  halfDays: number;
  leaveDays: number;
  unmarkedDays: number;
  grossPayable: string;
  advances: string;
  bonus: string;
  deductions: string;
  netPayable: string;
  payment: SalarySlipPayment | null;
}

export interface MarkAttendancePayload {
  date: string;
  records: { membershipId: string; status: AttendanceStatus; notes?: string }[];
}

export function useAttendance(date: string | null): UseQueryResult<ListResponse<AttendanceDay>> {
  return useQuery({
    queryKey: ['hr', 'attendance', date],
    queryFn: () => api<ListResponse<AttendanceDay>>('/hr/attendance', { query: { date: date ?? undefined } }),
    enabled: !!date,
  });
}

export function useMarkAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: MarkAttendancePayload) =>
      api<{ data: { date: string; marked: number } }>('/hr/attendance', {
        method: 'POST',
        body: payload,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr', 'attendance'] });
      qc.invalidateQueries({ queryKey: ['hr', 'salary'] });
    },
  });
}

export function useSalarySlips(year: number | null, month: number | null): UseQueryResult<ListResponse<SalarySlip>> {
  return useQuery({
    queryKey: ['hr', 'salary', year, month],
    queryFn: () =>
      api<ListResponse<SalarySlip>>('/hr/salary', {
        query: { year: year ?? undefined, month: month ?? undefined },
      }),
    enabled: year !== null && month !== null,
  });
}

export function useSalaryStructures(): UseQueryResult<ListResponse<SalaryStructure>> {
  return useQuery({
    queryKey: ['hr', 'salary-structure'],
    queryFn: () => api<ListResponse<SalaryStructure>>('/hr/salary-structure'),
  });
}

export function useSetSalaryStructure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ membershipId, monthlySalary }: { membershipId: string; monthlySalary: string }) =>
      api<{ data: SalaryStructure }>(`/hr/salary-structure/${membershipId}`, {
        method: 'PUT',
        body: { monthlySalary },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr', 'salary-structure'] });
      qc.invalidateQueries({ queryKey: ['hr', 'salary'] });
    },
  });
}

export function useRecordAdvance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { membershipId: string; amount: string; advanceDate?: string; notes?: string }) =>
      api<{ data: unknown }>('/hr/advances', { method: 'POST', body: payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr', 'salary'] });
    },
  });
}

export function usePaySalary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      membershipId: string;
      year: number;
      month: number;
      bonus?: string;
      deductions?: string;
      mode?: string;
      notes?: string;
    }) =>
      api<{
        data: {
          id: string;
          memberName: string;
          year: number;
          month: number;
          netPayable: string;
          status: string;
          carriedForward: string;
        };
      }>('/hr/salary/pay', { method: 'POST', body: payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr', 'salary'] });
    },
  });
}
