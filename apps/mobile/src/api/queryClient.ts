import { QueryClient } from '@tanstack/react-query';

/**
 * Module-level singleton so non-component code (e.g. the auth store's
 * switchShop) can invalidate cached shop data after the active shop changes.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
