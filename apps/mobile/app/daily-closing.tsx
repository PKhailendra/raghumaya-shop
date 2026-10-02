import { useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { useDailyClosing } from '../src/api/reports';
import { AppHeader } from '../src/components/AppHeader';
import { KpiCard } from '../src/components/KpiCard';
import { LoadingSpinner } from '../src/components/LoadingSpinner';
import { ErrorState } from '../src/components/ErrorState';
import { EmptyState } from '../src/components/EmptyState';
import { Money } from '../src/components/Money';
import { StatusChip } from '../src/components/StatusChip';
import { theme } from '../src/theme';
import { formatDate } from '../src/utils/format';

function localToday(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export default function DailyClosingScreen() {
  const [date, setDate] = useState(localToday());
  const report = useDailyClosing(date);

  const onDateChange = (v: string) => {
    // Accept only valid YYYY-MM-DD not in the future
    if (/^\d{4}-\d{2}-\d{2}$/.test(v) && v <= localToday()) setDate(v);
    else if (v.length < 10) setDate(v); // allow typing in progress
  };

  const isValidDate = /^\d{4}-\d{2}-\d{2}$/.test(date);

  if (!isValidDate)
    return (
      <View style={styles.container}>
        <AppHeader title="Daily Closing" subtitle="Enter a date" />
        <EmptyState title="No date" message="Type a valid date (YYYY-MM-DD) to view the report." />
      </View>
    );

  if (report.isLoading) return <LoadingSpinner />;
  if (report.isError || !report.data)
    return <ErrorState message="Could not load the daily closing report." onRetry={() => report.refetch()} />;

  const d = report.data;

  return (
    <View style={styles.container}>
      <AppHeader title="Daily Closing" subtitle={formatDate(d.date)} />

      <View style={styles.dateRow}>
        <Text style={styles.dateLabel}>Date</Text>
        <TextInput
          style={styles.dateInput}
          value={date}
          onChangeText={onDateChange}
          placeholder="YYYY-MM-DD"
          maxLength={10}
        />
      </View>

      <FlatList
        data={d.invoices}
        keyExtractor={(it) => it.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            <View style={styles.cards}>
              <KpiCard label="Total Sales" value={d.sales.totalSales} money />
              <KpiCard label="Collected" value={d.collections.totalCollected} money tone="success" />
              <KpiCard label="New Due" value={d.credit.newDue} money tone="warning" />
              <KpiCard label="Expenses" value={d.expenses.totalExpenses} money tone="danger" />
              <KpiCard label="Salary Paid" value={d.salary.salaryPaid} money />
              <KpiCard
                label="Net Cash"
                value={d.cash.netCash}
                money
                tone={Number(d.cash.netCash) >= 0 ? 'success' : 'danger'}
              />
            </View>
            <Text style={styles.sectionTitle}>Invoices ({d.sales.invoiceCount})</Text>
          </View>
        }
        ListEmptyComponent={<EmptyState title="No invoices" message="No invoices recorded for this date." />}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.invNo}>{item.invoiceNumber}</Text>
              <Text style={styles.meta}>{item.customerName ?? 'Walk-in'} · {formatDate(item.issueDate)}</Text>
            </View>
            <View style={styles.right}>
              <Money value={item.totalAmount} style={styles.amount} />
              <StatusChip status={item.status} />
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  dateRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 12 },
  dateLabel: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
  dateInput: { flex: 1, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: theme.colors.text },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  cards: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, padding: 12, marginBottom: 8 },
  invNo: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  meta: { fontSize: 12, color: theme.colors.subtext, marginTop: 2 },
  right: { alignItems: 'flex-end', gap: 4 },
  amount: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
});
