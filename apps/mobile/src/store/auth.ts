import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { api } from '../api/client';
import { queryClient } from '../api/queryClient';
import { Account, LoginResponse, Shop, ShopMembership, isChallenge } from '../api/types';

const KEYS = {
  accessToken: 'rm_access_token',
  refreshToken: 'rm_refresh_token',
  account: 'rm_account',
  memberships: 'rm_memberships',
  activeShopId: 'rm_active_shop_id',
} as const;

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  account: Account | null;
  memberships: ShopMembership[];
  activeShopId: string | null;
  hydrated: boolean;
  pendingChallenge: { challengeToken: string; methods: string[] } | null;

  hydrate: () => Promise<void>;
  login: (emailOrPhone: string, password: string) => Promise<'ok' | 'challenge'>;
  verify2FA: (code: string, method?: string) => Promise<void>;
  setTokens: (accessToken: string, refreshToken: string) => Promise<void>;
  applySession: (accessToken: string, refreshToken: string, data: { account?: Account; memberships?: ShopMembership[] }) => Promise<void>;
  switchShop: (shopId: string) => Promise<void>;
  logout: () => Promise<void>;
  clearAuth: () => Promise<void>;
  activeShop: () => Shop | null;
  can: (permission: string) => boolean;
}

function activeShopFrom(memberships: ShopMembership[], activeShopId: string | null): Shop | null {
  if (!activeShopId) return memberships[0]?.shop ?? null;
  return memberships.find((m) => m.shopId === activeShopId)?.shop ?? null;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  accessToken: null,
  refreshToken: null,
  account: null,
  memberships: [],
  activeShopId: null,
  hydrated: false,
  pendingChallenge: null,

  hydrate: async () => {
    const [accessToken, refreshToken, accountRaw, membershipsRaw, activeShopId] =
      await Promise.all([
        SecureStore.getItemAsync(KEYS.accessToken),
        SecureStore.getItemAsync(KEYS.refreshToken),
        SecureStore.getItemAsync(KEYS.account),
        SecureStore.getItemAsync(KEYS.memberships),
        SecureStore.getItemAsync(KEYS.activeShopId),
      ]);
    set({
      accessToken,
      refreshToken,
      account: accountRaw ? (JSON.parse(accountRaw) as Account) : null,
      memberships: membershipsRaw ? (JSON.parse(membershipsRaw) as ShopMembership[]) : [],
      activeShopId,
      hydrated: true,
    });
  },

  login: async (emailOrPhone, password) => {
    const res = await api<LoginResponse>('/auth/login', {
      method: 'POST',
      body: { emailOrPhone, password },
    });
    if (isChallenge(res)) {
      set({ pendingChallenge: { challengeToken: res.challengeToken, methods: res.methods } });
      return 'challenge';
    }
    await get().applySession(res.accessToken, res.refreshToken, res);
    set({ pendingChallenge: null });
    return 'ok';
  },

  verify2FA: async (code, method = 'AUTHENTICATOR') => {
    const { pendingChallenge } = get();
    if (!pendingChallenge) throw new Error('No pending 2FA challenge.');
    const res = await api<LoginResponse>('/auth/2fa/challenge/verify', {
      method: 'POST',
      body: { challengeToken: pendingChallenge.challengeToken, code, method },
    });
    if (isChallenge(res)) throw new Error('Verification failed.');
    await get().applySession(res.accessToken, res.refreshToken, res);
    set({ pendingChallenge: null });
  },

  setTokens: async (accessToken, refreshToken) => {
    await Promise.all([
      SecureStore.setItemAsync(KEYS.accessToken, accessToken),
      SecureStore.setItemAsync(KEYS.refreshToken, refreshToken),
    ]);
    set({ accessToken, refreshToken });
  },

  applySession: async (accessToken, refreshToken, data) => {
    // API returns `actor` (not `account`). Map actor -> account so the
    // Settings screen can show name/email/phone.
    const actor = (data as { actor?: { id?: string; fullName?: string; email?: string | null; phone?: string | null; activeShopId?: string } }).actor;
    const account: Account | undefined = data.account ?? (actor ? {
      id: actor.id ?? '',
      name: actor.fullName ?? '',
      email: actor.email ?? null,
      phone: actor.phone ?? null,
    } : undefined);
    // API returns `actor` (not `memberships`). Build a membership-like entry
    // from actor + /shops/context so permission checks (`can()`) work.
    let memberships: ShopMembership[] = data.memberships ?? [];
    const actorShopId = actor?.activeShopId ?? null;
    if (memberships.length === 0 && actorShopId) {
      try {
        const baseUrl =
          (process.env as Record<string, string | undefined>).EXPO_PUBLIC_API_URL ??
          'https://raghumaya-api-production.up.railway.app/api/v1';
        const res = await fetch(`${baseUrl}/shops/context`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) throw new Error('context fetch failed');
        const ctx = (await res.json()) as { shop: { id: string }; role: string; permissions: string[] };
        memberships = [
          {
            shopId: ctx.shop?.id ?? actorShopId,
            shop: ctx.shop as ShopMembership['shop'],
            role: ctx.role ?? 'STAFF',
            status: 'ACTIVE',
            permissions: ctx.permissions ?? [],
          },
        ];
      } catch {
        // context fetch failed — fall back to empty;
        // permission-gated UI will hide until a fresh login/hydrate.
        memberships = [];
      }
    }
    const activeShopId =
      get().activeShopId && memberships.some((m) => m.shopId === get().activeShopId)
        ? get().activeShopId
        : memberships[0]?.shopId ?? actorShopId;
    await Promise.all([
      SecureStore.setItemAsync(KEYS.accessToken, accessToken),
      SecureStore.setItemAsync(KEYS.refreshToken, refreshToken),
      account ? SecureStore.setItemAsync(KEYS.account, JSON.stringify(account)) : Promise.resolve(),
      SecureStore.setItemAsync(KEYS.memberships, JSON.stringify(memberships)),
      activeShopId ? SecureStore.setItemAsync(KEYS.activeShopId, activeShopId) : Promise.resolve(),
    ]);
    set({ accessToken, refreshToken, account: account ?? get().account, memberships, activeShopId });
  },

  switchShop: async (shopId) => {
    const res = await api<{ accessToken: string; refreshToken?: string; shop?: Shop }>('/shops/switch', {
      method: 'POST',
      body: { shopId },
    });
    const refreshToken = res.refreshToken ?? get().refreshToken ?? '';
    await get().setTokens(res.accessToken, refreshToken);
    // Refresh role/permissions for the newly active shop so permission-gated
    // UI reflects the new shop (one account can hold different roles per shop).
    let memberships = get().memberships;
    try {
      const ctx = await api<{ shop?: Shop; role?: string; permissions?: string[] }>('/shops/context');
      const entry: ShopMembership = {
        shopId,
        shop: ctx.shop ?? res.shop ?? memberships.find((m) => m.shopId === shopId)?.shop,
        role: ctx.role ?? memberships.find((m) => m.shopId === shopId)?.role ?? 'STAFF',
        status: 'ACTIVE',
        permissions: ctx.permissions ?? [],
      };
      memberships = [...memberships.filter((m) => m.shopId !== shopId), entry];
      await SecureStore.setItemAsync(KEYS.memberships, JSON.stringify(memberships));
    } catch {
      // Context refresh failed — keep previous memberships; the shop still switches.
    }
    await SecureStore.setItemAsync(KEYS.activeShopId, shopId);
    set({ activeShopId: shopId, memberships });
    // Drop cached data from the previous shop so every screen (dashboard,
    // customers, products, sales, finance) refetches for the newly selected shop.
    await queryClient.invalidateQueries();
  },

  logout: async () => {
    const { refreshToken } = get();
    try {
      await api('/auth/logout', {
        method: 'POST',
        body: { refreshToken, allDevices: false },
      });
    } catch {
      /* token may already be revoked */
    }
    await get().clearAuth();
  },

  clearAuth: async () => {
    await Promise.all(Object.values(KEYS).map((k) => SecureStore.deleteItemAsync(k)));
    set({
      accessToken: null,
      refreshToken: null,
      account: null,
      memberships: [],
      activeShopId: null,
      pendingChallenge: null,
    });
  },

  activeShop: () => activeShopFrom(get().memberships, get().activeShopId),
  can: (permission: string) => {
    const { memberships, activeShopId } = get();
    const m = memberships.find((x) => x.shopId === activeShopId) ?? memberships[0];
    if (!m) return false;
    if (m.role === 'OWNER') return true;
    return (m.permissions ?? []).includes(permission);
  },
}));
