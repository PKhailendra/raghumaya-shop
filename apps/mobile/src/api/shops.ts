import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { api } from './client';
import { FinanceDashboard, ListResponse, Shop, ShopMember, SubscriptionInfo } from './types';

export type { ShopMember };

export function useFinanceDashboard(): UseQueryResult<FinanceDashboard> {
  return useQuery({
    queryKey: ['finance', 'dashboard'],
    queryFn: () => api<FinanceDashboard>('/finance/dashboard'),
  });
}

export function useMyShops(): UseQueryResult<Shop[]> {
  return useQuery({
    queryKey: ['shops', 'mine'],
    queryFn: () => api<Shop[]>('/shops'),
  });
}

export function useShopMembers(shopId: string | null): UseQueryResult<ListResponse<ShopMember>> {
  return useQuery({
    queryKey: ['shops', shopId, 'members'],
    queryFn: async () => {
      const res = await api<ListResponse<ShopMember>>(`/shops/${shopId}/members`);
      // API nests identity under `account.fullName` — flatten so screens can use m.name directly
      res.data = res.data.map((m) => ({
        ...m,
        name: m.name ?? m.account?.fullName ?? 'Unknown member',
        email: m.email ?? m.account?.email ?? null,
        phone: m.phone ?? m.account?.phone ?? null,
      }));
      return res;
    },
    enabled: !!shopId,
  });
}

export function useSubscription(): UseQueryResult<SubscriptionInfo> {
  return useQuery({
    queryKey: ['subscriptions', 'current'],
    queryFn: () => api<SubscriptionInfo>('/subscriptions/current'),
  });
}

/* ---- Team member management ---- */

export interface InviteMemberInput {
  fullName: string;
  phone: string;
  email?: string;
  role: string;
  permissions?: string[];
}

export interface UpdateMemberInput {
  role?: string;
  permissions?: string[];
  status?: 'ACTIVE' | 'SUSPENDED';
}

export async function inviteMember(shopId: string, body: InviteMemberInput): Promise<ShopMember> {
  return api<ShopMember>(`/shops/${shopId}/members/invite`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateMember(shopId: string, memberId: string, body: UpdateMemberInput): Promise<ShopMember> {
  return api<ShopMember>(`/shops/${shopId}/members/${memberId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function removeMember(shopId: string, memberId: string): Promise<void> {
  await api(`/shops/${shopId}/members/${memberId}`, { method: 'DELETE' });
}
