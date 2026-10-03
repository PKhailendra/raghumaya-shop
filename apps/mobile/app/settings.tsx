import { useState } from 'react';
import { Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../src/store/auth';
import { useMyShops, useCreateShop } from '../src/api/shops';
import type { Shop } from '../src/api/types';
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
  const createShop = useCreateShop();
  const [switching, setSwitching] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newShopName, setNewShopName] = useState("");
  const [newShopCity, setNewShopCity] = useState("");
  const isOwner = memberships.some((m) => m.role === "OWNER");

  const doCreateShop = () => {
    if (!newShopName.trim()) {
      Alert.alert('Missing name', 'Please enter a shop name.');
      return;
    }
    createShop.mutate(
      { name: newShopName.trim(), city: newShopCity.trim() || undefined },
      {
        onSuccess: (shop: Shop) => {
          setShowCreate(false);
          setNewShopName("");
          setNewShopCity("");
          Alert.alert('Shop created', `"${shop.name}" has been added. Switch to it from My shops.`, [
            {
              text: 'Switch now',
              onPress: () => doSwitch(shop.id),
            },
            { text: 'Later' },
          ]);
        },
        onError: (e: unknown) => Alert.alert('Failed', e instanceof ApiError ? e.message : 'Could not create the shop.'),
      }
    );
  };

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
      {isOwner && (
        <TouchableOpacity style={styles.addShopBtn} onPress={() => setShowCreate(true)}>
          <Text style={styles.addShopText}>+ Add new shop</Text>
        </TouchableOpacity>
      )}
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

      <Modal visible={showCreate} transparent animationType="fade" onRequestClose={() => setShowCreate(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Add new shop</Text>
            <Text style={styles.label}>Shop name *</Text>
            <TextInput
              style={styles.input}
              value={newShopName}
              onChangeText={setNewShopName}
              placeholder="e.g. Sharma Store 2"
              placeholderTextColor={theme.colors.muted}
            />
            <Text style={styles.label}>City (optional)</Text>
            <TextInput
              style={styles.input}
              value={newShopCity}
              onChangeText={setNewShopCity}
              placeholder="City"
              placeholderTextColor={theme.colors.muted}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCreate(false)} disabled={createShop.isPending}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.createBtn, createShop.isPending && styles.disabledBtn]}
                onPress={doCreateShop}
                disabled={createShop.isPending}
              >
                <Text style={styles.createText}>{createShop.isPending ? 'Creating…' : 'Create shop'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  addShopBtn: { backgroundColor: theme.colors.primaryLight, borderRadius: theme.radius.md, padding: 12, alignItems: 'center', marginBottom: 8 },
  addShopText: { fontSize: 14, fontWeight: '700', color: theme.colors.primary },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modalBox: { backgroundColor: theme.colors.card, borderRadius: theme.radius.md, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text, marginBottom: 12 },
  input: { backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm, padding: 12, fontSize: 15, color: theme.colors.text, marginTop: 6, marginBottom: 8 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 12 },
  cancelBtn: { flex: 1, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm },
  cancelText: { fontSize: 15, fontWeight: '600', color: theme.colors.subtext },
  createBtn: { flex: 1, padding: 12, alignItems: 'center', backgroundColor: theme.colors.primary, borderRadius: theme.radius.sm },
  createText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  disabledBtn: { opacity: 0.6 },
});
