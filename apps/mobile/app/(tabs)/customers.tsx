import { useState } from 'react';
import { FlatList, RefreshControl, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useCustomers } from '../../src/api/customers';
import { AppHeader } from '../../src/components/AppHeader';
import { SearchBar } from '../../src/components/SearchBar';
import { LoadingSpinner } from '../../src/components/LoadingSpinner';
import { ErrorState } from '../../src/components/ErrorState';
import { EmptyState } from '../../src/components/EmptyState';
import { Money } from '../../src/components/Money';
import { theme } from '../../src/theme';

export default function CustomersScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [dueOnly, setDueOnly] = useState(false);
  const customers = useCustomers({ search: search || undefined });
  const all = customers.data?.data ?? [];
  const items = dueOnly
    ? all.filter((c) => parseFloat(c.totalDue ?? c.currentBalance ?? '0') > 0)
    : all;

  return (
    <View style={styles.container}>
      <AppHeader title="Customers" subtitle="Ledger, dues and reminders" />
      <SearchBar value={search} onChange={setSearch} placeholder="Search customers…" />

      <TouchableOpacity
        style={[styles.filterChip, dueOnly && styles.filterChipActive]}
        onPress={() => setDueOnly((v) => !v)}
      >
        <Text style={[styles.filterText, dueOnly && styles.filterTextActive]}>
          {dueOnly ? '✓ Showing due payments' : 'Show due payments only'}
        </Text>
      </TouchableOpacity>

      {customers.isLoading ? (
        <LoadingSpinner />
      ) : customers.isError ? (
        <ErrorState message="Could not load customers." onRetry={() => customers.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title="No customers found" message={dueOnly ? 'No customers have pending dues.' : 'Add customers from the list to get started.'} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={customers.isFetching} onRefresh={() => customers.refetch()} />}
          renderItem={({ item }) => {
            const due = parseFloat(item.totalDue ?? item.currentBalance ?? '0');
            return (
              <TouchableOpacity style={styles.row} onPress={() => router.push(`/customers/${item.id}`)}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.rowMain}>
                  <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.meta} numberOfLines={1}>{item.phone ?? 'No phone'}</Text>
                </View>
                {due > 0 ? (
                  <View style={styles.dueBox}>
                    <Text style={styles.dueLabel}>Due</Text>
                    <Money value={due.toFixed(2)} style={styles.due} />
                  </View>
                ) : (
                  <Text style={styles.settled}>Settled</Text>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  filterChip: { alignSelf: 'flex-start', marginHorizontal: 16, marginBottom: 4, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: theme.colors.card },
  filterChipActive: { backgroundColor: theme.colors.warningBg, borderColor: theme.colors.warning },
  filterText: { fontSize: 13, fontWeight: '600', color: theme.colors.text },
  filterTextActive: { color: theme.colors.warning },
  list: { padding: 12 },
  row: { flexDirection: 'row', backgroundColor: theme.colors.card, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: 12, marginBottom: 8, alignItems: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarText: { fontSize: 18, fontWeight: '700', color: theme.colors.primary },
  rowMain: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  meta: { fontSize: 12, color: theme.colors.subtext, marginTop: 2 },
  dueBox: { alignItems: 'flex-end' },
  dueLabel: { fontSize: 11, color: theme.colors.warning, fontWeight: '600' },
  due: { fontSize: 15, fontWeight: '800', color: theme.colors.warning },
  settled: { fontSize: 12, fontWeight: '600', color: theme.colors.success },
});
