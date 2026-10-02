import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { useFinanceDashboard } from '../src/api/shops';
import { KpiCard } from '../src/components/KpiCard';
import { LoadingSpinner } from '../src/components/LoadingSpinner';
import { ErrorState } from '../src/components/ErrorState';
import { theme } from '../src/theme';

function num(v: string | number | undefined | null): number {
  const n = parseFloat(String(v ?? '0'));
  return Number.isFinite(n) ? n : 0;
}

export default function FinanceScreen() {
  const fin = useFinanceDashboard();

  if (fin.isLoading) return <LoadingSpinner />;
  if (fin.isError || !fin.data)
    return <ErrorState message="Could not load finance summary." onRetry={() => fin.refetch()} />;

  const f = fin.data;
  const profit = num(f.grossProfit);
  const cashFlow = num(f.netCashFlow);

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.sectionTitle}>Revenue</Text>
      <View style={styles.grid}>
        <KpiCard label="Total revenue" value={num(f.totalRevenue)} money tone="success" />
        <KpiCard label="Invoices" value={f.invoiceCount ?? 0} />
        <KpiCard label="Invoice revenue" value={num(f.invoiceRevenue)} money />
        <KpiCard label="Other income" value={num(f.manualRevenue)} money />
      </View>

      <Text style={styles.sectionTitle}>Profit & Expenses</Text>
      <View style={styles.grid}>
        <KpiCard label="Gross profit" value={profit} money tone={profit >= 0 ? 'success' : 'danger'} />
        <KpiCard label="Total expenses" value={num(f.totalExpenses)} money tone="danger" />
      </View>

      <Text style={styles.sectionTitle}>Cash Flow</Text>
      <View style={styles.grid}>
        <KpiCard label="Cash in" value={num(f.cashIn)} money tone="success" />
        <KpiCard label="Cash out" value={num(f.cashOut)} money tone="danger" />
        <KpiCard label="Net cash flow" value={cashFlow} money tone={cashFlow >= 0 ? 'success' : 'danger'} />
      </View>

      <Text style={styles.sectionTitle}>Balance</Text>
      <View style={styles.grid}>
        <KpiCard label="Stock value" value={num(f.assetValue)} money />
        <KpiCard label="Outstanding dues" value={num(f.outstandingLiabilities)} money tone="warning" />
        <KpiCard label="Tax payable" value={num(f.taxPayable)} money tone="warning" />
      </View>
      {(num(f.cgst) > 0 || num(f.sgst) > 0 || num(f.igst) > 0) && (
        <View style={styles.grid}>
          <KpiCard label="CGST" value={num(f.cgst)} money />
          <KpiCard label="SGST" value={num(f.sgst)} money />
          <KpiCard label="IGST" value={num(f.igst)} money />
        </View>
      )}

      <View style={styles.note}>
        <Text style={styles.noteText}>
          Summary for the current period. Use the web dashboard for detailed reports.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: theme.colors.text, marginTop: 16, marginHorizontal: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, paddingTop: 8 },
  note: { margin: 16, marginTop: 8, backgroundColor: theme.colors.primaryLight, borderRadius: theme.radius.md, padding: 14 },
  noteText: { fontSize: 13, color: theme.colors.primary, lineHeight: 20 },
});
