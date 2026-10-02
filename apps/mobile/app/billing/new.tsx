import { useState, useMemo } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useCreateInvoice } from '../../src/api/billing';
import { useProducts } from '../../src/api/products';
import { useCustomers } from '../../src/api/customers';
import { useInvoiceBuilder, DraftItem } from '../../src/store/invoiceBuilder';
import { SearchBar } from '../../src/components/SearchBar';
import { Money } from '../../src/components/Money';
import { EmptyState } from '../../src/components/EmptyState';
import { computeTotals } from '../../src/utils/gst';
import { toMoney } from '../../src/utils/format';
import { ApiError } from '../../src/api/client';
import { Customer, Product } from '../../src/api/types';
import { theme } from '../../src/theme';

export default function NewInvoiceScreen() {
  const router = useRouter();
  const b = useInvoiceBuilder();
  const create = useCreateInvoice();

  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [showProductPicker, setShowProductPicker] = useState(false);

  const totals = useMemo(() => computeTotals(b.items), [b.items]);

  const submit = (status: 'DRAFT' | 'ISSUED') => {
    if (b.items.length === 0) {
      Alert.alert('No items', 'Add at least one item to the invoice.');
      return;
    }
    create.mutate(
      {
        customerId: b.customer?.id,
        status,
        issueDate: new Date().toISOString().slice(0, 10),
        isInterState: b.isInterState,
        notes: b.notes || undefined,
        items: b.items.map((it) => ({
          productId: it.productId,
          description: it.description,
          quantity: toMoney(it.quantity),
          unitPrice: toMoney(it.unitPrice),
          discountRate: toMoney(it.discountRate),
          gstRate: toMoney(it.gstRate),
        })),
      },
      {
        onSuccess: (invoice) => {
          b.clear();
          Alert.alert('Invoice created', `Invoice ${invoice.invoiceNumber} saved.`, [
            { text: 'View invoice', onPress: () => router.replace(`/billing/${invoice.id}`) },
            { text: 'Done', onPress: () => router.back(), style: 'cancel' },
          ]);
        },
        onError: (e) => {
          const msg = e instanceof ApiError ? e.message : 'Could not create the invoice.';
          Alert.alert('Failed', msg);
        },
      },
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Customer</Text>
      <TouchableOpacity style={styles.picker} onPress={() => setShowCustomerPicker(true)}>
        <Text style={b.customer ? styles.pickerValue : styles.pickerPlaceholder}>
          {b.customer ? b.customer.name : 'Walk-in customer (optional) — tap to pick'}
        </Text>
      </TouchableOpacity>

      <View style={styles.taxRow}>
        <Text style={styles.label}>Inter-state sale (IGST)</Text>
        <Switch value={b.isInterState} onValueChange={b.setIsInterState} />
      </View>

      <Text style={styles.sectionTitle}>Items</Text>
      {b.items.length === 0 ? (
        <EmptyState title="No items yet" message="Add products to build this invoice." />
      ) : (
        b.items.map((it) => <DraftItemRow key={it.key} item={it} />)
      )}
      <TouchableOpacity style={styles.addBtn} onPress={() => setShowProductPicker(true)}>
        <Text style={styles.addBtnText}>+ Add product</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.addBtn, styles.scanBtn]} onPress={() => router.push('/scan')}>
        <Text style={styles.addBtnText}>⌁ Scan barcode</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Notes</Text>
      <TextInput
        style={styles.notesInput}
        value={b.notes}
        onChangeText={b.setNotes}
        placeholder="Optional note for the customer"
        placeholderTextColor={theme.colors.muted}
        multiline
      />

      <View style={styles.totals}>
        <TotalRow label="Subtotal (taxable)" value={toMoney(totals.subtotal)} />
        <TotalRow label="Discount" value={toMoney(totals.discountTotal)} />
        {b.isInterState ? (
          <TotalRow label="IGST" value={toMoney(totals.igstTotal)} />
        ) : (
          <>
            <TotalRow label="CGST" value={toMoney(totals.cgstTotal)} />
            <TotalRow label="SGST" value={toMoney(totals.sgstTotal)} />
          </>
        )}
        <View style={styles.grandRow}>
          <Text style={styles.grandLabel}>Grand total</Text>
          <Money value={toMoney(totals.grandTotal)} style={styles.grandValue} />
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.draftBtn]}
          onPress={() => submit('DRAFT')}
          disabled={create.isPending}
        >
          <Text style={styles.draftBtnText}>Save as draft</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.issueBtn]}
          onPress={() => submit('ISSUED')}
          disabled={create.isPending}
        >
          <Text style={styles.issueBtnText}>{create.isPending ? 'Saving…' : 'Issue invoice'}</Text>
        </TouchableOpacity>
      </View>

      <CustomerPicker visible={showCustomerPicker} onClose={() => setShowCustomerPicker(false)} />
      <ProductPicker visible={showProductPicker} onClose={() => setShowProductPicker(false)} />
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

function DraftItemRow(props: { item: DraftItem }) {
  const updateItem = useInvoiceBuilder((s) => s.updateItem);
  const removeItem = useInvoiceBuilder((s) => s.removeItem);
  const { item } = props;
  const num = (v: string) => {
    const n = parseFloat(v);
    return Number.isNaN(n) ? 0 : n;
  };
  return (
    <View style={styles.itemCard}>
      <View style={styles.itemHeader}>
        <Text style={styles.itemName} numberOfLines={1}>{item.description}</Text>
        <TouchableOpacity onPress={() => removeItem(item.key)}>
          <Text style={styles.remove}>✕</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.itemFields}>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Qty</Text>
          <TextInput
            style={styles.fieldInput}
            keyboardType="decimal-pad"
            value={String(item.quantity)}
            onChangeText={(v) => updateItem(item.key, { quantity: num(v) })}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Price</Text>
          <TextInput
            style={styles.fieldInput}
            keyboardType="decimal-pad"
            value={String(item.unitPrice)}
            onChangeText={(v) => updateItem(item.key, { unitPrice: num(v) })}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Disc %</Text>
          <TextInput
            style={styles.fieldInput}
            keyboardType="decimal-pad"
            value={String(item.discountRate)}
            onChangeText={(v) => updateItem(item.key, { discountRate: num(v) })}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>GST %</Text>
          <TextInput
            style={styles.fieldInput}
            keyboardType="decimal-pad"
            value={String(item.gstRate)}
            onChangeText={(v) => updateItem(item.key, { gstRate: num(v) })}
          />
        </View>
      </View>
      <View style={styles.itemFooter}>
        <Text style={styles.gstNote}>GST auto-computed</Text>
        <Money value={toMoney(item.lineTotal)} style={styles.lineTotal} />
      </View>
    </View>
  );
}

function CustomerPicker(props: { visible: boolean; onClose: () => void }) {
  const setCustomer = useInvoiceBuilder((s) => s.setCustomer);
  const [search, setSearch] = useState('');
  const customers = useCustomers({ search: search || undefined });
  const list: Customer[] = customers.data?.data ?? [];
  return (
    <Modal visible={props.visible} animationType="slide" onRequestClose={props.onClose}>
      <View style={styles.modal}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Pick customer</Text>
          <TouchableOpacity onPress={props.onClose}><Text style={styles.closeBtn}>✕</Text></TouchableOpacity>
        </View>
        <SearchBar value={search} onChange={setSearch} placeholder="Search customers…" />
        <TouchableOpacity
          style={styles.picker}
          onPress={() => { setCustomer(null); props.onClose(); }}
        >
          <Text style={styles.pickerValue}>Walk-in customer (none)</Text>
        </TouchableOpacity>
        <FlatList
          data={list}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.pickRow}
              onPress={() => { setCustomer(item); props.onClose(); }}
            >
              <Text style={styles.pickName}>{item.name}</Text>
              <Text style={styles.pickMeta}>{item.phone ?? ''}</Text>
            </TouchableOpacity>
          )}
        />
      </View>
    </Modal>
  );
}

function ProductPicker(props: { visible: boolean; onClose: () => void }) {
  const addItem = useInvoiceBuilder((s) => s.addItemFromProduct);
  const [search, setSearch] = useState('');
  const products = useProducts({ search: search || undefined, limit: 30 });
  const list: Product[] = products.data?.data ?? [];
  return (
    <Modal visible={props.visible} animationType="slide" onRequestClose={props.onClose}>
      <View style={styles.modal}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Add product</Text>
          <TouchableOpacity onPress={props.onClose}><Text style={styles.closeBtn}>✕</Text></TouchableOpacity>
        </View>
        <SearchBar value={search} onChange={setSearch} placeholder="Search products…" />
        <FlatList
          data={list}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.pickRow}
              onPress={() => { addItem(item); props.onClose(); }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.pickName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.pickMeta}>Stock: {item.currentStock}</Text>
              </View>
              <Money value={item.sellingPrice} style={styles.pickPrice} />
            </TouchableOpacity>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 16, paddingBottom: 40 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: theme.colors.text, marginTop: 16, marginBottom: 8 },
  picker: { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm, padding: 12, marginHorizontal: 0 },
  pickerValue: { fontSize: 15, color: theme.colors.text, fontWeight: '600' },
  pickerPlaceholder: { fontSize: 15, color: theme.colors.muted },
  taxRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm, padding: 12 },
  label: { fontSize: 14, color: theme.colors.text, fontWeight: '600' },
  itemCard: { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, padding: 12, marginBottom: 8 },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemName: { fontSize: 15, fontWeight: '700', color: theme.colors.text, flex: 1 },
  remove: { fontSize: 16, color: theme.colors.danger, padding: 4 },
  itemFields: { flexDirection: 'row', marginTop: 8, gap: 8 },
  field: { flex: 1 },
  fieldLabel: { fontSize: 11, color: theme.colors.subtext, marginBottom: 4 },
  fieldInput: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm, paddingHorizontal: 8, paddingVertical: 8, fontSize: 14, color: theme.colors.text },
  itemFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  gstNote: { fontSize: 11, color: theme.colors.subtext },
  lineTotal: { fontSize: 15, fontWeight: '800', color: theme.colors.text },
  addBtn: { borderWidth: 1, borderColor: theme.colors.primary, borderRadius: theme.radius.sm, paddingVertical: 12, alignItems: 'center', marginTop: 8, borderStyle: 'dashed' },
  addBtnText: { color: theme.colors.primary, fontWeight: '700', fontSize: 15 },
  scanBtn: { borderColor: theme.colors.success },
  notesInput: { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm, padding: 12, fontSize: 14, color: theme.colors.text, minHeight: 64 },
  totals: { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, padding: 12, marginTop: 16 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  totalLabel: { fontSize: 13, color: theme.colors.subtext },
  totalValue: { fontSize: 13, fontWeight: '600', color: theme.colors.text },
  grandRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: theme.colors.border, marginTop: 8, paddingTop: 8 },
  grandLabel: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  grandValue: { fontSize: 18, fontWeight: '800', color: theme.colors.primary },
  actions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  actionBtn: { flex: 1, borderRadius: theme.radius.sm, paddingVertical: 14, alignItems: 'center' },
  draftBtn: { backgroundColor: theme.colors.mutedBg },
  draftBtnText: { color: theme.colors.text, fontWeight: '700', fontSize: 15 },
  issueBtn: { backgroundColor: theme.colors.primary },
  issueBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  modal: { flex: 1, backgroundColor: theme.colors.background, paddingTop: 48 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text },
  closeBtn: { fontSize: 20, color: theme.colors.subtext, padding: 8 },
  pickRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border, backgroundColor: theme.colors.card },
  pickName: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  pickMeta: { fontSize: 12, color: theme.colors.subtext, marginTop: 2 },
  pickPrice: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
});
