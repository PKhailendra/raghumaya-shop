import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import { useAuthStore } from '../src/store/auth';
import { OfflineBanner } from '../src/components/OfflineBanner';
import { LanguageProvider } from '../src/i18n';
import { theme } from '../src/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

function AuthGate() {
  const router = useRouter();
  const segments = useSegments();
  const { accessToken, hydrated, hydrate } = useAuthStore();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!hydrated) return;
    const inAuth = segments[0] === '(auth)';
    if (!accessToken && !inAuth) {
      router.replace('/(auth)/login');
    } else if (accessToken && inAuth) {
      router.replace('/(tabs)/dashboard');
    }
    setReady(true);
  }, [hydrated, accessToken, segments, router]);

  if (!hydrated || !ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <OfflineBanner />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="billing/new" options={{ presentation: 'modal', headerShown: true, title: 'New Invoice' }} />
        <Stack.Screen name="billing/[id]" options={{ headerShown: true, title: 'Invoice' }} />
        <Stack.Screen name="customers/[id]" options={{ headerShown: true, title: 'Customer' }} />
        <Stack.Screen name="scan" options={{ presentation: 'modal', headerShown: true, title: 'Scan Barcode' }} />
        <Stack.Screen name="alerts" options={{ headerShown: true, title: 'Stock Alerts' }} />
        <Stack.Screen name="finance" options={{ headerShown: true, title: 'Finance Summary' }} />
        <Stack.Screen name="team" options={{ headerShown: true, title: 'Team' }} />
        <Stack.Screen name="expenses" options={{ headerShown: true, title: 'Expenses' }} />
        <Stack.Screen name="daily-closing" options={{ headerShown: true, title: 'Daily Closing' }} />
        <Stack.Screen name="subscription" options={{ headerShown: true, title: 'Subscription' }} />
        <Stack.Screen name="settings" options={{ headerShown: true, title: 'Settings' }} />
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          <StatusBar style="dark" />
          <AuthGate />
        </LanguageProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
