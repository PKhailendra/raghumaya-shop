import { useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  EXPENSE_CATEGORIES,
  PAYMENT_MODES,
  useCreateExpense,
  useDeleteExpense,
  useExpenses,
  useExpenseSummary,
} from '../src/api/expenses';
import { AppHeader } from '../src/components/AppHeader';
import { LoadingSpinner } from '../src/components/LoadingSpinner';
import { ErrorState } from '../src/components/ErrorState';
import { EmptyState } from '../src/components/EmptyState';
import { Money } from '../src/components/Money';
import { theme } from '../src/theme';
import { formatDate } from '../src/utils/format';

function localToday(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export default function ExpensesScreen() {
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [monthStr, setMonthStr] = useState(localToday().slice(0, 7));
  const [formOpen, setFormOpen] = useState(false);

  const now = new Date();
  const [yr, mo] = monthStr.split('-').map(Number);
  const year = yr || now.getFullYear();
  const month = mo >= 1 && mo <= 12 ? mo : now.getMonth() + 1;
  const fromDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const toDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

  const list = useExpenses({ category, search: search || undefined, fromDate, toDate });
  const summary = useExpenseSummary(year, month);
  const del = useDeleteExpense();

  const items = list.data?.data ?? [];

  const confirmDelete = (id: string, title: string) => {
    Alert.alert('Delete expense', `Delete "${title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => del.mutate(id, { onError: (e) => Alert.alert('Error', e.message) }),
      },
    ]);
  };

  if (list.isLoading) return <LoadingSpinner />;
  if (list.isError)
    return <ErrorState message="Could not load expenses." onRetry={() => list.refetch()} />;

  return (
    <View style={styles.container}>
      <AppHeader title="Expenses" subtitle="Track shop spending" />
      <TouchableOpacity style={styles.addBtnTop} onPress={() => setFormOpen(true)}>
        <Text style={styles.addBtnText}>+ Add expense</Text>
      </TouchableOpacity>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>
          {summary.data ? `${monthStr}` : ''} total
        </Text>
        <Money value={summary.data?.grandTotal ?? '0'} style={styles.summaryValue} />
        <Text style={styles.summaryMeta}>
          {summary.data?.expenseCount ?? 0} entries
        </Text>
      </View>

      <View style={styles.filterRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search..."
          value={search}
          onChangeText={setSearch}
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
        <Chip label="All" active={!category} onPress={() => setCategory(undefined)} />
        {EXPENSE_CATEGORIES.map((c) => (
          <Chip key={c.value} label={c.label} active={category === c.value} onPress={() => setCategory(c.value)} />
        ))}
      </ScrollView>

      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<EmptyState title="No expenses" message="No expenses found for this month." />}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.meta}>
                {item.categoryName} · {formatDate(item.expenseDate)}
                {item.paymentMode ? ` · ${item.paymentMode}` : ''}
              </Text>
            </View>
            <Money value={item.amount} style={styles.amount} />
            <TouchableOpacity onPress={() => confirmDelete(item.id, item.title)} style={styles.delBtn}>
              <Text style={styles.delText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      <ExpenseFormModal visible={formOpen} onClose={() => setFormOpen(false)} />
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ExpenseFormModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCat] = useState('OTHER');
  const [date, setDate] = useState(localToday());
  const [mode, setMode] = useState<string>('CASH');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const create = useCreateExpense();

  const submit = () => {
    if (!title.trim()) return setError('Enter a title.');
    if (!amount || Number(amount) <= 0) return setError('Enter a valid amount.');
    if (date > localToday()) return setError('Date cannot be in the future.');
    setError(null);
    create.mutate(
      { category, title: title.trim(), amount, expenseDate: date, paymentMode: mode, notes: notes || undefined },
      {
        onSuccess: () => {
          setTitle(''); setAmount(''); setNotes(''); setError(null);
          onClose();
        },
        onError: (e) => setError(e.message),
      }
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent}>
        <Text style={styles.modalTitle}>Add expense</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.label}>Title</Text>
        <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="e.g. Shop rent" />

        <Text style={styles.label}>Amount (₹)</Text>
        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          keyboardType="decimal-pad"
        />

        <Text style={styles.label}>Category</Text>
        <View style={styles.pickRow}>
          {EXPENSE_CATEGORIES.map((c) => (
            <TouchableOpacity
              key={c.value}
              onPress={() => setCat(c.value)}
              style={[styles.pick, category === c.value && styles.pickActive]}
            >
              <Text style={[styles.pickText, category === c.value && styles.pickTextActive]}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
        <TextInput style={styles.input} value={date} onChangeText={setDate} placeholder="2026-10-02" />

        <Text style={styles.label}>Payment mode</Text>
        <View style={styles.pickRow}>
          {PAYMENT_MODES.map((m) => (
            <TouchableOpacity
              key={m}
              onPress={() => setMode(m)}
              style={[styles.pick, mode === m && styles.pickActive]}
            >
              <Text style={[styles.pickText, mode === m && styles.pickTextActive]}>{m}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Notes (optional)</Text>
        <TextInput style={styles.input} value={notes} onChangeText={setNotes} placeholder="Optional" />

        <View style={styles.modalActions}>
          <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={onClose}>
            <Text style={styles.btnGhostText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary]}
            onPress={submit}
            disabled={create.isPending}
          >
            <Text style={styles.btnPrimaryText}>{create.isPending ? 'Saving...' : 'Save'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  addBtnTop: { marginHorizontal: 16, marginBottom: 4, backgroundColor: theme.colors.primary, borderRadius: theme.radius.sm, paddingVertical: 12, alignItems: 'center' },
  addBtn: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.sm, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  summaryCard: { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, padding: 16, margin: 16, marginBottom: 8, alignItems: 'center' },
  summaryLabel: { fontSize: 12, color: theme.colors.subtext },
  summaryValue: { fontSize: 28, fontWeight: '800', color: theme.colors.text, marginTop: 4 },
  summaryMeta: { fontSize: 12, color: theme.colors.subtext, marginTop: 4 },
  filterRow: { paddingHorizontal: 16, marginBottom: 8 },
  searchInput: { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: theme.colors.text },
  chipRow: { paddingHorizontal: 16, marginBottom: 8, flexGrow: 0 },
  chip: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8, backgroundColor: theme.colors.card },
  chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { fontSize: 13, color: theme.colors.text },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, padding: 12, marginBottom: 8 },
  title: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  meta: { fontSize: 12, color: theme.colors.subtext, marginTop: 2 },
  amount: { fontSize: 16, fontWeight: '700', color: theme.colors.text, marginRight: 8 },
  delBtn: { padding: 8 },
  delText: { fontSize: 16, color: theme.colors.danger },
  modal: { flex: 1, backgroundColor: theme.colors.background },
  modalContent: { padding: 20 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: theme.colors.text, marginBottom: 12 },
  error: { color: theme.colors.danger, fontSize: 13, marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '600', color: theme.colors.text, marginTop: 12, marginBottom: 6 },
  input: { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: theme.colors.text },
  pickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pick: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.colors.card },
  pickActive: { backgroundColor: theme.colors.primaryLight, borderColor: theme.colors.primary },
  pickText: { fontSize: 13, color: theme.colors.text },
  pickTextActive: { color: theme.colors.primary, fontWeight: '700' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: theme.radius.sm, alignItems: 'center' },
  btnPrimary: { backgroundColor: theme.colors.primary },
  btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnGhost: { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border },
  btnGhostText: { color: theme.colors.text, fontWeight: '700', fontSize: 15 },
});
