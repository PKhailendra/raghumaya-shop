import { useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../src/store/auth';
import { useMyShops } from '../src/api/shops';
import { LoadingSpinner } from '../src/components/LoadingSpinner';
import { ErrorState } from '../src/components/ErrorState';
import { EmptyState } from '../src/components/EmptyState';
import { ApiError } from '../src/api/client';
import { theme } from '../src/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const account = useAuthStore((s) => s.account);
  const memberships = useAuthStore((s) => s.memberships);
  const activeShopId = useAuthStore((s) => s.activeShopId);
  const switchShop = useAuthStore((s) => s.switchShop);
  const shops = useMyShops();
  const [switching, setSwitching] = useState<string | null>(null);

  const doSwitch = async (shopId: string) => {
    if (shopId === activeShopId) return;
    setSwitching(shopId);
    try {
      await switchShop(shopId);
      // Land on the new shop's dashboard so the owner immediately sees the
      // selected shop's data (all screens were invalidated on switch).
      router.replace('/(tabs)/dashboard');
    } catch (e) {
      Alert.alert('Failed', e instanceof ApiError ? e.message : 'Could not switch shop.');
    } finally {
      setSwitching(null);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Account</Text>
      <View style={styles.card}>
        <SettingRow label="Name" value={account?.name ?? '—'} />
        <SettingRow label="Email" value={account?.email ?? '—'} />
        <SettingRow label="Phone" value={account?.phone ?? '—'} />
      </View>

      <Text style={styles.sectionTitle}>My shops</Text>
      {shops.isLoading ? (
        <LoadingSpinner />
      ) : shops.isError ? (
        <ErrorState message="Could not load shops." onRetry={() => shops.refetch()} />
      ) : (shops.data ?? []).length === 0 ? (
        <EmptyState title="No shops" message="No shops are linked to this account." />
      ) : (
        (shops.data ?? []).map((shop) => {
          const member = memberships.find((m) => m.shopId === shop.id);
          const active = shop.id === activeShopId;
          return (
            <TouchableOpacity key={shop.id} style={[styles.row, active && styles.rowActive]} onPress={() => doSwitch(shop.id)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.shopName}>{shop.name}</Text>
                <Text style={styles.shopMeta}>
                  {member?.role ?? shop.role ?? 'Member'}
                  {shop.state ? ` · ${shop.state}` : ''}
                </Text>
              </View>
              {active ? (
                <Text style={styles.activeBadge}>Active</Text>
              ) : (
                <Text style={styles.switchText}>{switching === shop.id ? 'Switching…' : 'Switch'}</Text>
              )}
            </TouchableOpacity>
          );
        })
      )}

      <Text style={styles.sectionTitle}>App</Text>
      <View style={styles.card}>
        <SettingRow label="App version" value="1.0.0" />
      </View>
    </ScrollView>
  );
}

function SettingRow(props: { label: string; value: string }) {
  return (
    <View style={styles.settingRow}>
      <Text style={styles.label}>{props.label}</Text>
      <Text style={styles.value} numberOfLines={1}>{props.value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 16, paddingBottom: 40 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.text, marginTop: 16, marginBottom: 8 },
  card: { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, paddingHorizontal: 14, paddingVertical: 4 },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  label: { fontSize: 14, color: theme.colors.subtext },
  value: { fontSize: 14, fontWeight: '600', color: theme.colors.text, marginLeft: 12, flexShrink: 1 },
  row: { flexDirection: 'row', backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, padding: 14, marginBottom: 8, alignItems: 'center' },
  rowActive: { borderColor: theme.colors.primary, borderWidth: 2 },
  shopName: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  shopMeta: { fontSize: 12, color: theme.colors.subtext, marginTop: 2 },
  activeBadge: { fontSize: 12, fontWeight: '700', color: theme.colors.success },
  switchText: { fontSize: 13, fontWeight: '700', color: theme.colors.primary },
});
