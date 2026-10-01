import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { useFinanceDashboard } from '../src/api/shops';
import { KpiCard } from '../src/components/KpiCard';
import { LoadingSpinner } from '../src/components/LoadingSpinner';
import { ErrorState } from '../src/components/ErrorState';
import { theme } from '../src/theme';

export default function FinanceScreen() {
  const fin = useFinanceDashboard();

  if (fin.isLoading) return <LoadingSpinner />;
  if (fin.isError || !fin.data)
    return <ErrorState message="Could not load finance summary." onRetry={() => fin.refetch()} />;

  const f = fin.data;
  return (
    <ScrollView style={styles.container}>
      <View style={styles.grid}>
        <KpiCard label="Total revenue" value={f.totalRevenue} money tone="success" />
        <KpiCard label="Total expenses" value={f.totalExpenses} money tone="danger" />
        <KpiCard label="Net profit" value={f.netProfit} money tone={parseFloat(f.netProfit) >= 0 ? 'success' : 'danger'} />
        <KpiCard label="Total assets" value={f.totalAssets} money />
        <KpiCard label="Total liabilities" value={f.totalLiabilities} money tone="warning" />
      </View>
      <View style={styles.note}>
        <Text style={styles.noteText}>
          Track income, expenses, assets and liabilities for your shop. Use the web dashboard for detailed reports.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 12 },
  note: { margin: 16, backgroundColor: theme.colors.primaryLight, borderRadius: theme.radius.md, padding: 14 },
  noteText: { fontSize: 13, color: theme.colors.primary, lineHeight: 20 },
});
