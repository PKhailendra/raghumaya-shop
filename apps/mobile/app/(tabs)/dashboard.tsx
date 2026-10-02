import { useState, useMemo } from 'react';
import { ScrollView, RefreshControl, View, Text, StyleSheet } from 'react-native';
import { format, subDays } from 'date-fns';
import { useDashboard, useDailySales, useTopProducts } from '../../src/api/dashboard';
import { AppHeader } from '../../src/components/AppHeader';
import { KpiCard } from '../../src/components/KpiCard';
import { ChartCard, BarDatum } from '../../src/components/ChartCard';
import { LoadingSpinner } from '../../src/components/LoadingSpinner';
import { ErrorState } from '../../src/components/ErrorState';
import { EmptyState } from '../../src/components/EmptyState';
import { Money } from '../../src/components/Money';
import { useAuthStore } from '../../src/store/auth';
import { theme } from '../../src/theme';

export default function DashboardScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const activeShop = useAuthStore((s) => s.activeShop)();

  const dash = useDashboard();
  const to = format(new Date(), 'yyyy-MM-dd');
  const from = format(subDays(new Date(), 13), 'yyyy-MM-dd');
  const sales = useDailySales(from, to);
  const topProducts = useTopProducts(5);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([dash.refetch(), sales.refetch(), topProducts.refetch()]);
    setRefreshing(false);
  };

  const barData: BarDatum[] = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sales.data ?? []) {
      map.set(s.date.slice(0, 10), parseFloat(s.total));
    }
    const out: BarDatum[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const key = format(d, 'yyyy-MM-dd');
      out.push({ label: format(d, 'd MMM'), value: map.get(key) ?? 0 });
    }
    return out;
  }, [sales.data]);

  if (dash.isLoading) return <LoadingSpinner />;
  if (dash.isError)
    return <ErrorState message="Could not load dashboard data." onRetry={() => dash.refetch()} />;

  const d = dash.data;
  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <AppHeader title="Dashboard" subtitle={activeShop?.name ?? 'Your shop'} />

      <View style={styles.kpiGrid}>
        <KpiCard label="Today's sales" value={d?.todaySales ?? '0'} money tone="success" />
        <KpiCard label="This month" value={d?.monthSales ?? '0'} money />
        <KpiCard label="Outstanding" value={d?.totalOutstanding ?? '0'} money tone="warning" />
        <KpiCard label="Low stock items" value={d?.lowStockCount ?? 0} tone={d && d.lowStockCount > 0 ? 'danger' : 'default'} />
      </View>

      <ChartCard title="Sales — last 14 days" data={barData} emptyMessage="No sales in the last 14 days." />

      <View style={styles.topCard}>
        <Text style={styles.cardTitle}>Top products</Text>
        {topProducts.isLoading ? (
          <LoadingSpinner />
        ) : (topProducts.data ?? []).length === 0 ? (
          <EmptyState title="No product data" message="Top products will appear once sales are recorded." />
        ) : (
          (topProducts.data ?? []).map((p) => (
            <View key={p.productId} style={styles.topRow}>
              <Text style={styles.topName} numberOfLines={1}>{p.productName}</Text>
              <Text style={styles.topQty}>×{p.quantity}</Text>
              <Money value={p.revenue} style={styles.topMoney} />
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12 },
  topCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    margin: theme.spacing.lg,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.text, marginBottom: theme.spacing.sm },
  topRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: theme.colors.border },
  topName: { flex: 1, fontSize: 14, color: theme.colors.text },
  topQty: { fontSize: 13, color: theme.colors.subtext, marginHorizontal: 8 },
  topMoney: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
});
