import { Alert, Linking, ScrollView, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useCustomer, useCustomerLedger, useCustomerInvoices, useSmsReminder, useWhatsappReminder } from '../../src/api/customers';
import { LoadingSpinner } from '../../src/components/LoadingSpinner';
import { ErrorState } from '../../src/components/ErrorState';
import { EmptyState } from '../../src/components/EmptyState';
import { Money } from '../../src/components/Money';
import { StatusChip } from '../../src/components/StatusChip';
import { formatDate } from '../../src/utils/format';
import { theme } from '../../src/theme';

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const customer = useCustomer(id);
  const ledger = useCustomerLedger(id);
  const purchases = useCustomerInvoices(id);
  const smsReminder = useSmsReminder(id);
  const whatsappReminder = useWhatsappReminder(id);

  const c = customer.data;

  const sendSms = () => {
    smsReminder.mutate(undefined, {
      onSuccess: () => Alert.alert('Queued', 'Payment reminder SMS has been queued.'),
      onError: () => Alert.alert('Failed', 'Could not queue the SMS reminder.'),
    });
  };

  const sendWhatsapp = async () => {
    try {
      const res = await whatsappReminder.mutateAsync(undefined);
      await Linking.openURL(res.url);
    } catch {
      Alert.alert('Failed', 'Could not create the WhatsApp reminder link.');
    }
  };

  if (customer.isLoading) return <LoadingSpinner />;
  if (customer.isError || !c)
    return <ErrorState message="Could not load the customer." onRetry={() => customer.refetch()} />;

  const due = parseFloat(c.totalDue ?? c.currentBalance ?? '0');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.profile}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{c.name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{c.name}</Text>
          <Text style={styles.meta}>{c.phone ?? 'No phone'}</Text>
          {c.email ? <Text style={styles.meta}>{c.email}</Text> : null}
          {c.address ? <Text style={styles.meta}>{c.address}</Text> : null}
        </View>
      </View>

      <View style={styles.dueCard}>
        <Text style={styles.dueLabel}>Current due</Text>
        <Money value={due.toFixed(2)} style={[styles.dueValue, { color: due > 0 ? theme.colors.danger : theme.colors.success }]} />
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity style={[styles.actionBtn, styles.smsBtn]} onPress={sendSms} disabled={smsReminder.isPending}>
          <Text style={styles.actionText}>{smsReminder.isPending ? 'Sending…' : 'SMS reminder'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, styles.waBtn]} onPress={sendWhatsapp} disabled={whatsappReminder.isPending}>
          <Text style={styles.actionText}>{whatsappReminder.isPending ? 'Opening…' : 'WhatsApp reminder'}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Ledger</Text>
      {ledger.isLoading ? (
        <LoadingSpinner />
      ) : (ledger.data?.entries ?? []).length === 0 ? (
        <EmptyState title="No ledger entries" message="Invoices and payments will appear here." />
      ) : (
        <View style={styles.card}>
          {ledger.data!.entries.map((e) => (
            <View key={e.id} style={styles.entryRow}>
              <View style={styles.entryMain}>
                <Text style={styles.entryType}>{e.type === 'INVOICE' ? '🧾 Invoice' : '💰 Payment'}</Text>
                <Text style={styles.entryMeta}>{formatDate(e.date)}{e.reference ? ` · ${e.reference}` : ''}</Text>
              </View>
              <View style={styles.entrySide}>
                {parseFloat(e.debit) > 0 ? <Money value={e.debit} style={styles.debit} /> : null}
                {parseFloat(e.credit) > 0 ? <Money value={e.credit} style={styles.credit} /> : null}
                <Text style={styles.balance}>Bal: ₹{parseFloat(e.balance).toLocaleString('en-IN')}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.sectionTitle}>Due invoices</Text>
      {purchases.isLoading ? (
        <LoadingSpinner />
      ) : (
        <View style={styles.card}>
          {(purchases.data ?? [])
            .filter((inv) => parseFloat(inv.balanceDue) > 0)
            .map((inv) => (
              <View key={inv.id} style={styles.entryRow}>
                <View style={styles.entryMain}>
                  <Text style={styles.entryType}>{inv.invoiceNumber}</Text>
                  <Text style={styles.entryMeta}>Due {formatDate(inv.dueDate)}</Text>
                </View>
                <View style={styles.entrySide}>
                  <Money value={inv.balanceDue} style={styles.dueMoney} />
                  <StatusChip status={inv.status} />
                </View>
              </View>
            ))}
          {(purchases.data ?? []).filter((inv) => parseFloat(inv.balanceDue) > 0).length === 0 && (
            <EmptyState title="No due invoices" message="This customer has no pending dues." />
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 16, paddingBottom: 40 },
  profile: { flexDirection: 'row', backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, padding: 14, alignItems: 'center' },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: theme.colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  avatarText: { fontSize: 24, fontWeight: '700', color: theme.colors.primary },
  name: { fontSize: 19, fontWeight: '700', color: theme.colors.text },
  meta: { fontSize: 13, color: theme.colors.subtext, marginTop: 2 },
  dueCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, padding: 14, marginTop: 12 },
  dueLabel: { fontSize: 14, color: theme.colors.subtext, fontWeight: '600' },
  dueValue: { fontSize: 22, fontWeight: '800' },
  actionRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  actionBtn: { flex: 1, borderRadius: theme.radius.sm, paddingVertical: 12, alignItems: 'center' },
  smsBtn: { backgroundColor: theme.colors.primary },
  waBtn: { backgroundColor: '#128C4A' },
  actionText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.text, marginTop: 20, marginBottom: 8 },
  card: { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, paddingHorizontal: 12, paddingVertical: 4 },
  entryRow: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border, alignItems: 'center' },
  entryMain: { flex: 1, marginRight: 8 },
  entryType: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
  entryMeta: { fontSize: 12, color: theme.colors.subtext, marginTop: 2 },
  entrySide: { alignItems: 'flex-end', gap: 2 },
  debit: { fontSize: 14, fontWeight: '700', color: theme.colors.danger },
  credit: { fontSize: 14, fontWeight: '700', color: theme.colors.success },
  balance: { fontSize: 11, color: theme.colors.subtext },
  dueMoney: { fontSize: 14, fontWeight: '800', color: theme.colors.warning },
});
