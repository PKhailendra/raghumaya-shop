import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { useLowStockAlerts, useOutOfStockAlerts } from '../src/api/stock';
import { LoadingSpinner } from '../src/components/LoadingSpinner';
import { ErrorState } from '../src/components/ErrorState';
import { EmptyState } from '../src/components/EmptyState';
import { Money } from '../src/components/Money';
import { theme } from '../src/theme';

export default function AlertsScreen() {
  const low = useLowStockAlerts();
  const out = useOutOfStockAlerts();
  const refetch = () => {
    low.refetch();
    out.refetch();
  };

  if (low.isLoading || out.isLoading) return <LoadingSpinner />;
  if (low.isError || out.isError)
    return <ErrorState message="Could not load stock alerts." onRetry={refetch} />;

  const lowItems = low.data ?? [];
  const outItems = out.data ?? [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Out of stock ({outItems.length})</Text>
      {outItems.length === 0 ? (
        <EmptyState title="All good" message="No products are out of stock." />
      ) : (
        outItems.map((a, i) => (
          <AlertRow key={i} name={a.productName ?? a.product?.name ?? 'Unknown'} stock={a.currentStock} price={a.product?.sellingPrice} tone="danger" />
        ))
      )}

      <Text style={styles.sectionTitle}>Low stock ({lowItems.length})</Text>
      {lowItems.length === 0 ? (
        <EmptyState title="All good" message="No products are running low." />
      ) : (
        lowItems.map((a, i) => (
          <AlertRow key={i} name={a.productName ?? a.product?.name ?? 'Unknown'} stock={a.currentStock} price={a.product?.sellingPrice} tone="warning" />
        ))
      )}
    </ScrollView>
  );
}

function AlertRow(props: { name: string; stock: string; price?: string | null; tone: 'danger' | 'warning' }) {
  const fg = props.tone === 'danger' ? theme.colors.danger : theme.colors.warning;
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>{props.name}</Text>
        <Text style={[styles.stock, { color: fg }]}>Stock: {props.stock}</Text>
      </View>
      {props.price ? <Money value={props.price} style={styles.price} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 16, paddingBottom: 40 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text, marginTop: 12, marginBottom: 8 },
  row: { flexDirection: 'row', backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, padding: 12, marginBottom: 8, alignItems: 'center' },
  name: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  stock: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  price: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
});
