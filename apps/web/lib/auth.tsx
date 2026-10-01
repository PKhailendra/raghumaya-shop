"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Account,
  LoginResponse,
  authApi,
  setAccessToken,
  setRefreshToken,
  shopsApi,
} from "./api";

type AuthState = {
  account: Account | null;
  loading: boolean;
  login: (emailOrPhone: string, password: string) => Promise<LoginResponse>;
  logout: () => Promise<void>;
  switchShop: (shopId: string) => Promise<void>;
  activeShopId: string | null;
};

const AuthContext = createContext<AuthState | null>(null);
const ACCOUNT_KEY = "rms_account";

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const saved = localStorage.getItem(ACCOUNT_KEY);
        if (saved && readCookie("rms_rt")) {
          const parsed = JSON.parse(saved) as Account;
          setAccount(parsed);
          try {
            const res = await authApi.refresh(readCookie("rms_rt")!);
            setAccessToken(res.accessToken);
            setRefreshToken(res.refreshToken);
          } catch {
            // Refresh failed — session is gone. Clean up.
            localStorage.removeItem(ACCOUNT_KEY);
            setRefreshToken(null);
            setAccount(null);
          }
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (emailOrPhone: string, password: string) => {
    const res: LoginResponse = await authApi.login({ emailOrPhone, password });
    if ("requiresTwoFactor" in res && !res.requiresTwoFactor) {
      setAccessToken(res.accessToken);
      setRefreshToken(res.refreshToken);
      setAccount(res.account);
      localStorage.setItem(ACCOUNT_KEY, JSON.stringify(res.account));
    }
    return res;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore
    }
    setAccessToken(null);
    setRefreshToken(null);
    localStorage.removeItem(ACCOUNT_KEY);
    setAccount(null);
  }, []);

  const switchShop = useCallback(async (shopId: string) => {
    const res = await shopsApi.switch(shopId);
    setAccessToken(res.accessToken);
    const updated: Account = { ...account!, activeShopId: shopId };
    setAccount(updated);
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(updated));
  }, [account]);

  const value = useMemo<AuthState>(
    () => ({
      account,
      loading,
      login,
      logout,
      switchShop,
      activeShopId: account?.activeShopId ?? null,
    }),
    [account, loading, login, logout, switchShop]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function isPlatformAdmin(account: Account | null): boolean {
  return !!account && account.type === "admin" && (account.role === "SUPER_ADMIN" || account.role === "ADMIN");
}
