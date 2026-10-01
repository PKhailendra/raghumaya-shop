import { useEffect, useState } from 'react';
import * as Network from 'expo-network';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../theme';

export function useIsOffline(): boolean {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    let mounted = true;
    const check = async () => {
      try {
        const state = await Network.getNetworkStateAsync();
        if (mounted) setOffline(state.isConnected === false || state.isInternetReachable === false);
      } catch {
        /* ignore */
      }
    };
    check();
    const id = setInterval(check, 5000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);
  return offline;
}

export function OfflineBanner() {
  const offline = useIsOffline();
  if (!offline) return null;
  return (
    <View style={styles.banner}>
      <Text style={styles.text}>You are offline. Showing cached data.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { backgroundColor: theme.colors.dangerBg, paddingVertical: 8, paddingHorizontal: 16 },
  text: { color: theme.colors.danger, fontSize: 12, fontWeight: '600', textAlign: 'center' },
});
