import { useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
} from 'react-native';
import {
  useSalarySlips,
  useSetSalaryStructure,
  useRecordAdvance,
  usePaySalary,
  SalarySlip,
} from '../src/api/hr';
import { useShopMembers } from '../src/api/shops';
import { useAuthStore } from '../src/store/auth';
import { AppHeader } from '../src/components/AppHeader';
import { LoadingSpinner } from '../src/components/LoadingSpinner';
import { ErrorState } from '../src/components/ErrorState';
import { EmptyState } from '../src/components/EmptyState';
import { theme } from '../src/theme';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function inr(v: string | number): string {
  const n = Number(v);
  if (isNaN(n)) return '₹0';
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function monthLabel(year: number, month: number): string {
  return `${MONTHS[month - 1]} ${year}`;
}

export default function SalaryScreen() {
  const activeShopId = useAuthStore((s) => s.activeShopId);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [selected, setSelected] = useState<SalarySlip | null>(null);
  const [payModal, setPayModal] = useState(false);
  const [salaryModal, setSalaryModal] = useState(false);
  const [advanceModal, setAdvanceModal] = useState(false);

  const slips = useSalarySlips(year, month);
  const members = useShopMembers(activeShopId);
  const setSalary = useSetSalaryStructure();
  const recordAdvance = useRecordAdvance();
  const paySalary = usePaySalary();

  const changeMonth = (delta: number) => {
    let y = year;
    let m = month + delta;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    // No future months
    const cur = new Date();
    if (y > cur.getFullYear() || (y === cur.getFullYear() && m > cur.getMonth() + 1)) return;
    setYear(y);
    setMonth(m);
  };

  const staffList = useMemo(
    () => (members.data?.data ?? []).filter((m) => m.role !== 'OWNER'),
    [members.data]
  );

  const handlePay = (bonus: string, deductions: string, mode: string) => {
    if (!selected) return;
    if (bonus && Number(bonus) < 0) {
      Alert.alert('Invalid', 'Bonus cannot be negative.');
      return;
    }
    if (deductions && Number(deductions) < 0) {
      Alert.alert('Invalid', 'Deductions cannot be negative.');
      return;
    }
    paySalary.mutate(
      {
        membershipId: selected.member.membershipId,
        year,
        month,
        bonus: bonus || undefined,
        deductions: deductions || undefined,
        mode,
      },
      {
        onSuccess: (res) => {
          setPayModal(false);
          setSelected(null);
          const cf = Number(res.data.carriedForward);
          Alert.alert(
            'Paid',
            cf > 0
              ? `Salary paid. ${inr(cf)} advance carried to next month.`
              : 'Salary paid successfully.'
          );
        },
        onError: (err: unknown) =>
          Alert.alert('Error', err instanceof Error ? err.message : 'Could not pay salary.'),
      }
    );
  };

  const handleSetSalary = (membershipId: string, amount: string) => {
    if (!amount || Number(amount) <= 0) {
      Alert.alert('Invalid', 'Enter a valid monthly salary.');
      return;
    }
    setSalary.mutate(
      { membershipId, monthlySalary: amount },
      {
        onSuccess: () => {
          setSalaryModal(false);
          Alert.alert('Saved', 'Monthly salary updated.');
        },
        onError: (err: unknown) =>
          Alert.alert('Error', err instanceof Error ? err.message : 'Could not save.'),
      }
    );
  };

  const handleAdvance = (membershipId: string, amount: string) => {
    if (!amount || Number(amount) <= 0) {
      Alert.alert('Invalid', 'Enter a valid amount.');
      return;
    }
    recordAdvance.mutate(
      { membershipId, amount },
      {
        onSuccess: () => {
          setAdvanceModal(false);
          Alert.alert('Saved', 'Advance recorded.');
        },
        onError: (err: unknown) =>
          Alert.alert('Error', err instanceof Error ? err.message : 'Could not save.'),
      }
    );
  };

  if (slips.isLoading || members.isLoading) return <LoadingSpinner />;
  if (slips.isError)
    return <ErrorState message="Could not load salary slips." onRetry={() => slips.refetch()} />;

  const list = slips.data?.data ?? [];

  return (
    <ScrollView style={styles.container}>
      <AppHeader title="Salary" subtitle={monthLabel(year, month)} />

      {/* Month navigator */}
      <View style={styles.dateRow}>
        <TouchableOpacity style={styles.dateBtn} onPress={() => changeMonth(-1)}>
          <Text style={styles.dateBtnText}>‹ Prev</Text>
        </TouchableOpacity>
        <Text style={styles.dateText}>{monthLabel(year, month)}</Text>
        <TouchableOpacity
          style={styles.dateBtn}
          onPress={() => changeMonth(1)}
          disabled={year === new Date().getFullYear() && month === new Date().getMonth() + 1}
        >
          <Text style={[styles.dateBtnText, year === new Date().getFullYear() && month === new Date().getMonth() + 1 && styles.dateBtnDisabled]}>Next ›</Text>
        </TouchableOpacity>
      </View>

      {/* Quick actions */}
      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => setSalaryModal(true)}>
          <Text style={styles.actionBtnText}>Set salary</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => setAdvanceModal(true)}>
          <Text style={styles.actionBtnText}>Advance</Text>
        </TouchableOpacity>
      </View>

      {list.length === 0 ? (
        <EmptyState title="No salary records" message={`No salary data for ${monthLabel(year, month)}.`} />
      ) : (
        list.map((s) => (
          <TouchableOpacity
            key={s.member.membershipId}
            style={styles.card}
            onPress={() => setSelected(s)}
          >
            <View style={styles.cardTop}>
              <Text style={styles.name}>{s.member.name}</Text>
              <Text style={[styles.status, s.payment ? styles.statusPaid : styles.statusPending]}>
                {s.payment ? 'PAID' : 'PENDING'}
              </Text>
            </View>
            <View style={styles.cardRow}>
              <Text style={styles.meta}>Present: {s.presentDays}d</Text>
              <Text style={styles.meta}>Gross: {inr(s.grossPayable)}</Text>
            </View>
            <View style={styles.cardRow}>
              <Text style={styles.meta}>Advances: {inr(s.advances)}</Text>
              <Text style={styles.net}>Net: {inr(s.netPayable)}</Text>
            </View>
          </TouchableOpacity>
        ))
      )}

      {/* Slip detail modal */}
      <Modal visible={!!selected && !payModal} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={styles.modalBg}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{selected?.member.name}</Text>
            <Text style={styles.modalSub}>{monthLabel(year, month)}</Text>
            {selected && (
              <View style={styles.detailRows}>
                <DetailRow label="Monthly salary" value={inr(selected.monthlySalary)} />
                <DetailRow label="Present days" value={String(selected.presentDays)} />
                <DetailRow label="Gross payable" value={inr(selected.grossPayable)} />
                <DetailRow label="Advances" value={inr(selected.advances)} />
                <DetailRow label="Net payable" value={inr(selected.netPayable)} bold />
                <DetailRow label="Status" value={selected.payment ? 'PAID' : 'PENDING'} />
              </View>
            )}
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setSelected(null)}>
                <Text style={styles.modalCancelText}>Close</Text>
              </TouchableOpacity>
              {selected && !selected.payment && (
                <TouchableOpacity style={styles.modalPrimary} onPress={() => setPayModal(true)}>
                  <Text style={styles.modalPrimaryText}>Pay now</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Pay modal */}
      <Modal visible={payModal} transparent animationType="slide" onRequestClose={() => setPayModal(false)}>
        <PayForm
          slip={selected}
          onCancel={() => setPayModal(false)}
          onPay={handlePay}
          busy={paySalary.isPending}
        />
      </Modal>

      {/* Set salary modal */}
      <Modal visible={salaryModal} transparent animationType="slide" onRequestClose={() => setSalaryModal(false)}>
        <MemberPickerForm
          title="Set monthly salary"
          staff={staffList}
          onCancel={() => setSalaryModal(false)}
          onSubmit={handleSetSalary}
          busy={setSalary.isPending}
          amountLabel="Monthly salary (₹)"
        />
      </Modal>

      {/* Advance modal */}
      <Modal visible={advanceModal} transparent animationType="slide" onRequestClose={() => setAdvanceModal(false)}>
        <MemberPickerForm
          title="Record advance"
          staff={staffList}
          onCancel={() => setAdvanceModal(false)}
          onSubmit={handleAdvance}
          busy={recordAdvance.isPending}
          amountLabel="Advance amount (₹)"
        />
      </Modal>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

function DetailRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, bold && styles.detailBold]}>{value}</Text>
    </View>
  );
}

function PayForm({
  slip,
  onCancel,
  onPay,
  busy,
}: {
  slip: SalarySlip | null;
  onCancel: () => void;
  onPay: (bonus: string, deductions: string, mode: string) => void;
  busy: boolean;
}) {
  const [bonus, setBonus] = useState('');
  const [deductions, setDeductions] = useState('');
  const [mode, setMode] = useState('CASH');
  const MODES = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER'];
  const bonusNum = bonus === '' ? 0 : Number(bonus);
  const dedNum = deductions === '' ? 0 : Number(deductions);
  const net = slip && !isNaN(bonusNum) && !isNaN(dedNum)
    ? Math.max(0, Number(slip.netPayable) + bonusNum - dedNum)
    : (slip ? Number(slip.netPayable) : 0);
  return (
    <View style={styles.modalBg}>
      <View style={styles.modal}>
        <Text style={styles.modalTitle}>Pay salary</Text>
        <Text style={styles.modalSub}>
          {slip?.member.name} — Net: {inr(slip?.netPayable ?? 0)}
        </Text>
        <Text style={styles.inputLabel}>Bonus (₹)</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={bonus}
          onChangeText={setBonus}
          placeholder="0"
        />
        <Text style={styles.inputLabel}>Deductions (₹)</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={deductions}
          onChangeText={setDeductions}
          placeholder="0"
        />
        <Text style={styles.inputLabel}>Payment mode</Text>
        <View style={styles.modeRow}>
          {MODES.map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.modeChip, mode === m && styles.modeChipActive]}
              onPress={() => setMode(m)}
            >
              <Text style={[styles.modeChipText, mode === m && styles.modeChipTextActive]}>{m}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.preview}>Payable: {inr(net)}</Text>
        <View style={styles.modalBtns}>
          <TouchableOpacity style={styles.modalCancel} onPress={onCancel}>
            <Text style={styles.modalCancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalPrimary, busy && styles.btnDisabled]}
            onPress={() => onPay(bonus, deductions, mode)}
            disabled={busy}
          >
            <Text style={styles.modalPrimaryText}>{busy ? 'Paying…' : 'Confirm pay'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function MemberPickerForm({
  title,
  staff,
  onCancel,
  onSubmit,
  busy,
  amountLabel,
}: {
  title: string;
  staff: { id: string; name: string; role: string }[];
  onCancel: () => void;
  onSubmit: (membershipId: string, amount: string) => void;
  busy: boolean;
  amountLabel: string;
}) {
  const [memberId, setMemberId] = useState('');
  const [amount, setAmount] = useState('');
  return (
    <View style={styles.modalBg}>
      <View style={styles.modal}>
        <Text style={styles.modalTitle}>{title}</Text>
        <Text style={styles.inputLabel}>Staff member</Text>
        <ScrollView style={styles.pickerList}>
          {staff.map((m) => (
            <TouchableOpacity
              key={m.id}
              style={[styles.pickerRow, memberId === m.id && styles.pickerRowActive]}
              onPress={() => setMemberId(m.id)}
            >
              <Text style={[styles.pickerText, memberId === m.id && styles.pickerTextActive]}>
                {m.name} ({m.role})
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <Text style={styles.inputLabel}>{amountLabel}</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={amount}
          onChangeText={setAmount}
          placeholder="0"
        />
        <View style={styles.modalBtns}>
          <TouchableOpacity style={styles.modalCancel} onPress={onCancel}>
            <Text style={styles.modalCancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalPrimary, busy && styles.btnDisabled]}
            onPress={() => memberId && onSubmit(memberId, amount)}
            disabled={busy || !memberId}
          >
            <Text style={styles.modalPrimaryText}>{busy ? 'Saving…' : 'Save'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  dateBtn: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  dateBtnText: { fontSize: 14, fontWeight: '600', color: theme.colors.primary },
  dateBtnDisabled: { color: theme.colors.muted },
  dateText: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  actionsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 12 },
  actionBtn: {
    flex: 1,
    backgroundColor: theme.colors.primaryLight,
    borderRadius: theme.radius.sm,
    paddingVertical: 10,
    alignItems: 'center',
  },
  actionBtnText: { color: theme.colors.primary, fontWeight: '700', fontSize: 14 },
  card: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  status: { fontSize: 11, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  statusPaid: { backgroundColor: '#DCFCE7', color: '#166534' },
  statusPending: { backgroundColor: '#FEF3C7', color: '#92400E' },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  meta: { fontSize: 13, color: theme.colors.subtext },
  net: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    padding: 20,
    maxHeight: '80%',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text },
  modalSub: { fontSize: 13, color: theme.colors.subtext, marginTop: 4, marginBottom: 12 },
  detailRows: { marginBottom: 12 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  detailLabel: { fontSize: 14, color: theme.colors.subtext },
  detailValue: { fontSize: 14, color: theme.colors.text },
  detailBold: { fontWeight: '700' },
  modalBtns: { flexDirection: 'row', gap: 8, marginTop: 12 },
  modalCancel: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCancelText: { fontWeight: '600', color: theme.colors.text },
  modalPrimary: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalPrimaryText: { fontWeight: '700', color: '#fff' },
  btnDisabled: { opacity: 0.6 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: theme.colors.text, marginTop: 12, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
  },
  preview: { fontSize: 16, fontWeight: '700', color: theme.colors.primary, marginTop: 12 },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  modeChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border },
  modeChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  modeChipText: { fontSize: 12, color: theme.colors.text },
  modeChipTextActive: { color: '#fff', fontWeight: '600' },
  pickerList: { maxHeight: 160, marginBottom: 8 },
  pickerRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: theme.radius.sm,
    marginBottom: 4,
    backgroundColor: theme.colors.background,
  },
  pickerRowActive: { backgroundColor: theme.colors.primaryLight },
  pickerText: { fontSize: 14, color: theme.colors.text },
  pickerTextActive: { fontWeight: '700', color: theme.colors.primary },
});
