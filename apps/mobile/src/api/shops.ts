import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { api } from './client';
import { FinanceDashboard, ListResponse, Shop, ShopMember, SubscriptionInfo } from './types';

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
