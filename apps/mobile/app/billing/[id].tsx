import { useState } from 'react';
import { Alert, ScrollView, Text, TextInput, TouchableOpacity, View, StyleSheet, Linking, Share } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useInvoice, useRecordPayment, useInvoiceWhatsappLink, useInvoiceSmsLink } from '../../src/api/billing';
import { StatusChip } from '../../src/components/StatusChip';
import { LoadingSpinner } from '../../src/components/LoadingSpinner';
import { ErrorState } from '../../src/components/ErrorState';
import { Money } from '../../src/components/Money';
import { formatDate } from '../../src/utils/format';
import { ApiError } from '../../src/api/client';
import { theme } from '../../src/theme';

export default function InvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const invoice = useInvoice(id);
  const recordPayment = useRecordPayment();
  const whatsappLink = useInvoiceWhatsappLink(id);
  const smsLink = useInvoiceSmsLink(id);

  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('CASH');

  const markPaid = () => {
    const due = parseFloat(invoice.data?.balanceDue ?? '0');
    const amt = amount.trim() ? parseFloat(amount) : due;
    if (Number.isNaN(amt) || amt <= 0) {
      Alert.alert('Invalid amount', 'Enter a valid payment amount.');
      return;
    }
    recordPayment.mutate(
      { invoiceId: id, customerId: invoice.data?.customerId ?? undefined, amount: amt.toFixed(2), mode, direction: 'IN' },
      {
        onSuccess: () => {
          setAmount('');
          Alert.alert('Payment recorded', `Received ${amt.toFixed(2)}.`);
          invoice.refetch();
        },
        onError: (e) => {
          Alert.alert('Failed', e instanceof ApiError ? e.message : 'Could not record payment.');
        },
      },
    );
  };

  const shareLink = async (kind: 'whatsapp' | 'sms') => {
    try {
      const m = kind === 'whatsapp' ? whatsappLink : smsLink;
      const res = await m.mutateAsync();
      const url = res.url;
      if (kind === 'whatsapp') {
        await Share.share({ message: `Invoice ${invoice.data?.invoiceNumber}: ${url}` });
      } else {
        await Linking.openURL(url.startsWith('sms:') ? url : `sms:?body=${encodeURIComponent(`Invoice ${invoice.data?.invoiceNumber}: ${url}`)}`);
      }
    } catch {
      Alert.alert('Failed', 'Could not create the share link.');
    }
  };

  if (invoice.isLoading) return <LoadingSpinner />;
  if (invoice.isError || !invoice.data)
    return <ErrorState message="Could not load the invoice." onRetry={() => invoice.refetch()} />;

  const inv = invoice.data;
  const fullyPaid = parseFloat(inv.balanceDue) <= 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.number}>{inv.invoiceNumber}</Text>
          <Text style={styles.meta}>
            {inv.customer?.name ?? 'Walk-in customer'} · {formatDate(inv.issueDate)}
          </Text>
        </View>
        <StatusChip status={inv.status} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Items</Text>
        {(inv.items ?? []).map((it) => (
          <View key={it.id} style={styles.itemRow}>
            <View style={styles.itemMain}>
              <Text style={styles.itemDesc} numberOfLines={1}>{it.description}</Text>
              <Text style={styles.itemMeta}>
                {it.quantity} × <Money value={it.unitPrice} style={styles.inline} />
                {it.discountRate && parseFloat(it.discountRate) > 0 ? ` · ${it.discountRate}% off` : ''}
                {it.gstRate && parseFloat(it.gstRate) > 0 ? ` · GST ${it.gstRate}%` : ''}
              </Text>
            </View>
            <Money value={it.lineTotal ?? '0'} style={styles.itemTotal} />
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Totals</Text>
        <TotalRow label="Subtotal" value={inv.subtotal} />
        <TotalRow label="Discount" value={inv.discountTotal} />
        <TotalRow label="CGST" value={inv.cgstTotal} />
        <TotalRow label="SGST" value={inv.sgstTotal} />
        <TotalRow label="IGST" value={inv.igstTotal} />
        <View style={styles.grandRow}>
          <Text style={styles.grandLabel}>Grand total</Text>
          <Money value={inv.grandTotal} style={styles.grandValue} />
        </View>
        <TotalRow label="Paid" value={inv.paidAmount} />
        <View style={styles.grandRow}>
          <Text style={styles.grandLabel}>Balance due</Text>
          <Money value={inv.balanceDue} style={[styles.grandValue, { color: parseFloat(inv.balanceDue) > 0 ? theme.colors.danger : theme.colors.success }]} />
        </View>
      </View>

      {!fullyPaid && inv.status !== 'CANCELLED' && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Record payment</Text>
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            placeholder={`Amount (due: ${inv.balanceDue})`}
            placeholderTextColor={theme.colors.muted}
            keyboardType="decimal-pad"
          />
          <View style={styles.modeRow}>
            {['CASH', 'UPI', 'CARD', 'BANK_TRANSFER'].map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.modeChip, mode === m && styles.modeChipActive]}
                onPress={() => setMode(m)}
              >
                <Text style={[styles.modeText, mode === m && styles.modeTextActive]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.payBtn} onPress={markPaid} disabled={recordPayment.isPending}>
            <Text style={styles.payBtnText}>{recordPayment.isPending ? 'Recording…' : 'Mark payment'}</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.shareRow}>
        <TouchableOpacity style={styles.shareBtn} onPress={() => shareLink('whatsapp')}>
          <Text style={styles.shareText}>Share on WhatsApp</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.shareBtn} onPress={() => shareLink('sms')}>
          <Text style={styles.shareText}>Send via SMS</Text>
        </TouchableOpacity>
      </View>

      {inv.notes ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Notes</Text>
          <Text style={styles.notes}>{inv.notes}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function TotalRow(props: { label: string; value: string }) {
  return (
    <View style={styles.totalRow}>
      <Text style={styles.totalLabel}>{props.label}</Text>
      <Money value={props.value} style={styles.totalValue} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 16, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  number: { fontSize: 22, fontWeight: '800', color: theme.colors.text },
  meta: { fontSize: 13, color: theme.colors.subtext, marginTop: 4 },
  card: { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, padding: 12, marginBottom: 12 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.text, marginBottom: 8 },
  itemRow: { flexDirection: 'row', paddingVertical: 8, borderTopWidth: 1, borderTopColor: theme.colors.border, alignItems: 'center' },
  itemMain: { flex: 1, marginRight: 8 },
  itemDesc: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
  itemMeta: { fontSize: 12, color: theme.colors.subtext, marginTop: 2 },
  inline: { fontSize: 12, color: theme.colors.subtext },
  itemTotal: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  totalLabel: { fontSize: 13, color: theme.colors.subtext },
  totalValue: { fontSize: 13, fontWeight: '600', color: theme.colors.text },
  grandRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: theme.colors.border, marginTop: 6, paddingTop: 8 },
  grandLabel: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  grandValue: { fontSize: 17, fontWeight: '800', color: theme.colors.text },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: theme.colors.text, marginBottom: 8 },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  modeChip: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.colors.card },
  modeChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  modeText: { fontSize: 12, fontWeight: '600', color: theme.colors.text },
  modeTextActive: { color: '#fff' },
  payBtn: { backgroundColor: theme.colors.success, borderRadius: theme.radius.sm, paddingVertical: 12, alignItems: 'center' },
  payBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  shareRow: { flexDirection: 'row', gap: 12 },
  shareBtn: { flex: 1, backgroundColor: theme.colors.primaryLight, borderRadius: theme.radius.sm, paddingVertical: 12, alignItems: 'center' },
  shareText: { color: theme.colors.primary, fontWeight: '700', fontSize: 14 },
  notes: { fontSize: 14, color: theme.colors.text },
});
