import { useState, useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../src/store/auth';
import { useProducts, useCategories, useProduct, useDeleteProduct } from '../../src/api/products';
import { AppHeader } from '../../src/components/AppHeader';
import { SearchBar } from '../../src/components/SearchBar';
import { LoadingSpinner } from '../../src/components/LoadingSpinner';
import { ErrorState } from '../../src/components/ErrorState';
import { EmptyState } from '../../src/components/EmptyState';
import { Money } from '../../src/components/Money';
import { formatDate } from '../../src/utils/format';
import { Product } from '../../src/api/types';
import { theme } from '../../src/theme';
import { ApiError } from '../../src/api/client';

function stockTone(p: Product): 'ok' | 'low' | 'out' {
  const stock = parseFloat(p.currentStock);
  const min = p.minStockLevel ? parseFloat(p.minStockLevel) : 5;
  if (stock <= 0) return 'out';
  if (stock <= min) return 'low';
  return 'ok';
}

const badgeStyle = {
  ok: { bg: theme.colors.successBg, fg: theme.colors.success, label: 'In stock' },
  low: { bg: theme.colors.warningBg, fg: theme.colors.warning, label: 'Low' },
  out: { bg: theme.colors.dangerBg, fg: theme.colors.danger, label: 'Out of stock' },
};

export default function InventoryScreen() {
  const router = useRouter();
  const can = useAuthStore((s) => s.can);
  const memberships = useAuthStore((s) => s.memberships);
  const activeShopId = useAuthStore((s) => s.activeShopId);
  const myRole = (memberships.find((m) => m.shopId === activeShopId) ?? memberships[0])?.role;
  const canManage = myRole === 'OWNER' || can('INVENTORY_CREATE');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const products = useProducts({ search: search || undefined, categoryId, limit: 50 });
  const categories = useCategories();

  const items = useMemo(() => products.data?.data ?? [], [products.data]);

  return (
    <View style={styles.container}>
      <AppHeader title="Inventory" subtitle="Products and stock levels" />
      <SearchBar value={search} onChange={setSearch} placeholder="Search products, SKU…" />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
        <TouchableOpacity
          style={[styles.chip, !categoryId && styles.chipActive]}
          onPress={() => setCategoryId(undefined)}
        >
          <Text style={[styles.chipText, !categoryId && styles.chipTextActive]}>All</Text>
        </TouchableOpacity>
        {(categories.data?.data ?? []).map((c) => (
          <TouchableOpacity
            key={c.id}
            style={[styles.chip, categoryId === c.id && styles.chipActive]}
            onPress={() => setCategoryId(categoryId === c.id ? undefined : c.id)}
          >
            <Text style={[styles.chipText, categoryId === c.id && styles.chipTextActive]}>{c.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {products.isLoading ? (
        <LoadingSpinner />
      ) : products.isError ? (
        <ErrorState message="Could not load products." onRetry={() => products.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title="No products found" message="Try a different search or category." />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={products.isFetching} onRefresh={() => products.refetch()} />}
          renderItem={({ item }) => {
            const tone = badgeStyle[stockTone(item)];
            return (
              <TouchableOpacity style={styles.row} onPress={() => setSelectedId(item.id)}>
                <View style={styles.rowMain}>
                  <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {item.sku ?? 'No SKU'} · {item.category?.name ?? 'Uncategorized'}
                  </Text>
                </View>
                <View style={styles.rowSide}>
                  <Money value={item.sellingPrice} style={styles.price} />
                  <View style={[styles.badge, { backgroundColor: tone.bg }]}>
                    <Text style={[styles.badgeText, { color: tone.fg }]}>
                      {tone.label} · {item.currentStock}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      <TouchableOpacity style={styles.scanFab} onPress={() => router.push('/scan?mode=inventory')}>
        <Text style={styles.scanFabText}>📷 Scan</Text>
      </TouchableOpacity>

      {canManage && (
        <TouchableOpacity style={[styles.scanFab, styles.addFab]} onPress={() => router.push('/inventory/product-form')}>
          <Text style={styles.scanFabText}>+ Add</Text>
        </TouchableOpacity>
      )}

      <ProductDetailModal productId={selectedId} onClose={() => setSelectedId(null)} />
    </View>
  );
}

function ProductDetailModal(props: { productId: string | null; onClose: () => void }) {
  const { data, isLoading } = useProduct(props.productId ?? '');
  const router = useRouter();
  const can = useAuthStore((s) => s.can);
  const memberships = useAuthStore((s) => s.memberships);
  const activeShopId = useAuthStore((s) => s.activeShopId);
  const myRole = (memberships.find((m) => m.shopId === activeShopId) ?? memberships[0])?.role;
  const isOwner = myRole === 'OWNER';
  const canManage = isOwner || can('INVENTORY_UPDATE');
  const canDelete = isOwner || can('INVENTORY_DELETE');
  const del = useDeleteProduct();

  const doDelete = () => {
    if (!props.productId) return;
    Alert.alert(
      'Delete product?',
      `"${data?.name}" will be removed from inventory. This cannot be undone.`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            del.mutate(props.productId!, {
              onSuccess: () => {
                Alert.alert('Deleted', 'Product removed.');
                props.onClose();
              },
              onError: (e) => {
                Alert.alert('Failed', e instanceof ApiError ? e.message : 'Could not delete.');
              },
            }),
        },
      ],
    );
  };

  return (
    <Modal visible={!!props.productId} animationType="slide" onRequestClose={props.onClose}>
      <View style={styles.modal}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Product details</Text>
          <TouchableOpacity onPress={props.onClose}>
            <Text style={styles.closeBtn}>✕</Text>
          </TouchableOpacity>
        </View>
        {isLoading || !data ? (
          <LoadingSpinner />
        ) : (
          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={styles.detailName}>{data.name}</Text>
            <DetailRow label="SKU" value={data.sku ?? '—'} />
            <DetailRow label="Barcode" value={data.barcode ?? '—'} />
            <DetailRow label="Category" value={data.category?.name ?? '—'} />
            <DetailRow label="Brand" value={data.brand?.name ?? '—'} />
            <DetailRow label="Unit" value={data.unit ?? '—'} />
            <DetailRow label="Selling price" value={<Money value={data.sellingPrice} />} />
            <DetailRow label="MRP" value={data.mrp ? <Money value={data.mrp} /> : '—'} />
            <DetailRow label="GST rate" value={data.gstRate ? `${data.gstRate}%` : '—'} />
            <DetailRow label="Current stock" value={data.currentStock} />
            <DetailRow label="Min stock level" value={data.minStockLevel ?? '—'} />
            <DetailRow label="Added on" value={formatDate((data as { createdAt?: string }).createdAt)} />
            {(canManage || canDelete) && (
              <View style={styles.modalActions}>
                {canManage && (
                  <TouchableOpacity
                    style={styles.editBtn}
                    onPress={() => {
                      props.onClose();
                      router.push(`/inventory/product-form?id=${data.id}`);
                    }}
                  >
                    <Text style={styles.editBtnText}>Edit</Text>
                  </TouchableOpacity>
                )}
                {canDelete && (
                  <TouchableOpacity style={styles.deleteBtn} onPress={doDelete} disabled={del.isPending}>
                    <Text style={styles.deleteBtnText}>{del.isPending ? 'Deleting…' : 'Delete'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function DetailRow(props: { label: string; value: ReactNode }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{props.label}</Text>
      <View style={styles.detailValueWrap}>
        {typeof props.value === 'string' ? <Text style={styles.detailValue}>{props.value}</Text> : props.value}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  chipRow: { paddingHorizontal: 12, maxHeight: 44 },
  chip: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8, backgroundColor: theme.colors.card },
  chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: theme.colors.text },
  chipTextActive: { color: '#fff' },
  list: { padding: 12 },
  row: { flexDirection: 'row', backgroundColor: theme.colors.card, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: 12, marginBottom: 8, alignItems: 'center' },
  rowMain: { flex: 1, marginRight: 8 },
  name: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  meta: { fontSize: 12, color: theme.colors.subtext, marginTop: 2 },
  rowSide: { alignItems: 'flex-end' },
  price: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, marginTop: 4 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  scanFab: { position: 'absolute', right: 16, bottom: 24, backgroundColor: theme.colors.primary, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 14, elevation: 4 },
  scanFabText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  addFab: { right: 120, backgroundColor: theme.colors.success },
  modal: { flex: 1, backgroundColor: theme.colors.background, paddingTop: 48 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  modalTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text },
  closeBtn: { fontSize: 20, color: theme.colors.subtext, padding: 8 },
  modalBody: { padding: 16 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  editBtn: { flex: 1, backgroundColor: theme.colors.primary, borderRadius: theme.radius.sm, paddingVertical: 12, alignItems: 'center' },
  editBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  deleteBtn: { flex: 1, borderWidth: 1, borderColor: theme.colors.danger, borderRadius: theme.radius.sm, paddingVertical: 12, alignItems: 'center' },
  deleteBtnText: { color: theme.colors.danger, fontWeight: '700', fontSize: 15 },
  detailName: { fontSize: 20, fontWeight: '700', color: theme.colors.text, marginBottom: 12 },
  detailRow: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  detailLabel: { flex: 1, fontSize: 14, color: theme.colors.subtext },
  detailValueWrap: { flex: 1, alignItems: 'flex-end' },
  detailValue: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
});
