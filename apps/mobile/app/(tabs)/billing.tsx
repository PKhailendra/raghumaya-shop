import { useState } from 'react';
import { FlatList, RefreshControl, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useInvoices } from '../../src/api/billing';
import { AppHeader } from '../../src/components/AppHeader';
import { SearchBar } from '../../src/components/SearchBar';
import { StatusChip } from '../../src/components/StatusChip';
import { LoadingSpinner } from '../../src/components/LoadingSpinner';
import { ErrorState } from '../../src/components/ErrorState';
import { EmptyState } from '../../src/components/EmptyState';
import { Money } from '../../src/components/Money';
import { formatDate } from '../../src/utils/format';
import { theme } from '../../src/theme';

const STATUS_FILTERS = ['ALL', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'DRAFT'];

export default function BillingScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const invoices = useInvoices({
    search: search || undefined,
    status: status === 'ALL' ? undefined : status,
  });
  const items = invoices.data?.data ?? [];

  return (
    <View style={styles.container}>
      <AppHeader title="Billing" subtitle="Invoices and payments" />
      <SearchBar value={search} onChange={setSearch} placeholder="Search invoice number or customer…" />

      <FlatList
        data={STATUS_FILTERS}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipRow}
        keyExtractor={(s) => s}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.chip, status === item && styles.chipActive]}
            onPress={() => setStatus(item)}
          >
            <Text style={[styles.chipText, status === item && styles.chipTextActive]}>
              {item === 'ALL' ? 'All' : item.replace(/_/g, ' ')}
            </Text>
          </TouchableOpacity>
        )}
      />

      {invoices.isLoading ? (
        <LoadingSpinner />
      ) : invoices.isError ? (
        <ErrorState message="Could not load invoices." onRetry={() => invoices.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title="No invoices found" message="Create your first invoice to get started." />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={invoices.isFetching} onRefresh={() => invoices.refetch()} />}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => router.push(`/billing/${item.id}`)}>
              <View style={styles.rowMain}>
                <Text style={styles.number}>{item.invoiceNumber}</Text>
                <Text style={styles.meta}>
                  {item.customer?.name ?? 'Walk-in customer'} · {formatDate(item.issueDate)}
                </Text>
              </View>
              <View style={styles.rowSide}>
                <Money value={item.grandTotal} style={styles.total} />
                <StatusChip status={item.status} />
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => router.push('/billing/new')}>
        <Text style={styles.fabText}>+ New Invoice</Text>
      </TouchableOpacity>
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
  list: { padding: 12, paddingBottom: 96 },
  row: { flexDirection: 'row', backgroundColor: theme.colors.card, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: 12, marginBottom: 8, alignItems: 'center' },
  rowMain: { flex: 1, marginRight: 8 },
  number: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  meta: { fontSize: 12, color: theme.colors.subtext, marginTop: 2 },
  rowSide: { alignItems: 'flex-end', gap: 4 },
  total: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
  fab: { position: 'absolute', right: 16, bottom: 24, backgroundColor: theme.colors.primary, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 14, elevation: 4 },
  fabText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
