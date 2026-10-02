import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
} from 'react-native';
import { useAttendance, useMarkAttendance, AttendanceStatus } from '../src/api/hr';
import { useShopMembers } from '../src/api/shops';
import { useAuthStore } from '../src/store/auth';
import { AppHeader } from '../src/components/AppHeader';
import { LoadingSpinner } from '../src/components/LoadingSpinner';
import { ErrorState } from '../src/components/ErrorState';
import { EmptyState } from '../src/components/EmptyState';
import { theme } from '../src/theme';

const STATUS_OPTIONS: { value: AttendanceStatus; label: string; short: string }[] = [
  { value: 'PRESENT', label: 'Present', short: 'P' },
  { value: 'ABSENT', label: 'Absent', short: 'A' },
  { value: 'HALF_DAY', label: 'Half day', short: 'H' },
  { value: 'PAID_LEAVE', label: 'Leave', short: 'L' },
  { value: 'WEEKLY_OFF', label: 'Off', short: 'O' },
];

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayStr(): string {
  return localDateStr(new Date());
}

export default function AttendanceScreen() {
  const activeShopId = useAuthStore((s) => s.activeShopId);
  const [date, setDate] = useState(todayStr());
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const [dirty, setDirty] = useState(false);

  const members = useShopMembers(activeShopId);
  const attendance = useAttendance(date);
  const saveMutation = useMarkAttendance();

  // Seed marks from fetched records (don't overwrite unsaved edits)
  useEffect(() => {
    if (dirty) return;
    const seed: Record<string, AttendanceStatus> = {};
    for (const d of attendance.data?.data ?? []) {
      const rec = d.records[0];
      if (rec) seed[d.member.membershipId] = rec.status;
    }
    setMarks(seed);
  }, [attendance.data, date]); // eslint-disable-line react-hooks/exhaustive-deps

  const changeDate = (delta: number) => {
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    const next = localDateStr(d);
    if (next > todayStr()) return; // no future dates
    setDate(next);
    setDirty(false);
  };

  const markOne = (id: string, status: AttendanceStatus) => {
    setMarks((p) => ({ ...p, [id]: status }));
    setDirty(true);
  };

  const markAll = (status: AttendanceStatus) => {
    const all: Record<string, AttendanceStatus> = {};
    for (const m of members.data?.data ?? []) {
      if (m.role === 'OWNER') continue;
      all[m.id] = status;
    }
    setMarks(all);
    setDirty(true);
  };

  const handleSave = () => {
    const records = Object.entries(marks).map(([membershipId, status]) => ({
      membershipId,
      status,
    }));
    if (records.length === 0) {
      Alert.alert('Nothing to save', 'Mark attendance for at least one staff member.');
      return;
    }
    saveMutation.mutate(
      { date, records },
      {
        onSuccess: () => {
          setDirty(false);
          Alert.alert('Saved', 'Attendance saved successfully.');
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : 'Could not save attendance.';
          Alert.alert('Error', msg);
        },
      }
    );
  };

  const staffList = useMemo(
    () => (members.data?.data ?? []).filter((m) => m.role !== 'OWNER'),
    [members.data]
  );

  const isLoading = members.isLoading || attendance.isLoading;
  const isError = members.isError || attendance.isError;

  if (isLoading) return <LoadingSpinner />;
  if (isError)
    return (
      <ErrorState
        message="Could not load attendance."
        onRetry={() => {
          members.refetch();
          attendance.refetch();
        }}
      />
    );

  const isToday = date === todayStr();

  return (
    <ScrollView style={styles.container}>
      <AppHeader title="Attendance" subtitle={isToday ? 'Today' : date} />

      {/* Date navigator */}
      <View style={styles.dateRow}>
        <TouchableOpacity style={styles.dateBtn} onPress={() => changeDate(-1)}>
          <Text style={styles.dateBtnText}>‹ Prev</Text>
        </TouchableOpacity>
        <Text style={styles.dateText}>{date}</Text>
        <TouchableOpacity
          style={[styles.dateBtn, isToday && styles.dateBtnDisabled]}
          onPress={() => changeDate(1)}
          disabled={isToday}
        >
          <Text style={[styles.dateBtnText, isToday && styles.dateBtnTextDisabled]}>Next ›</Text>
        </TouchableOpacity>
      </View>

      {/* Quick actions */}
      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => markAll('PRESENT')}>
          <Text style={styles.actionBtnText}>All present</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => markAll('WEEKLY_OFF')}>
          <Text style={styles.actionBtnText}>All off</Text>
        </TouchableOpacity>
      </View>

      {staffList.length === 0 ? (
        <EmptyState
          title="No staff"
          message={activeShopId ? "No staff members to mark attendance for." : "Select a shop to view staff."}
        />
      ) : (
        staffList.map((m) => (
          <View key={m.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{m.name}</Text>
              <Text style={styles.meta}>{m.role}</Text>
            </View>
            <View style={styles.statusRow}>
              {STATUS_OPTIONS.map((o) => {
                const active = marks[m.id] === o.value;
                return (
                  <TouchableOpacity
                    key={o.value}
                    style={[styles.statusBtn, active && styles.statusBtnActive]}
                    onPress={() => markOne(m.id, o.value)}
                  >
                    <Text style={[styles.statusText, active && styles.statusTextActive]}>
                      {o.short}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))
      )}

      <TouchableOpacity
        style={[styles.saveBtn, saveMutation.isPending && styles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={saveMutation.isPending}
      >
        <Text style={styles.saveBtnText}>
          {saveMutation.isPending ? 'Saving…' : 'Save attendance'}
        </Text>
      </TouchableOpacity>

      <View style={{ height: 32 }} />
    </ScrollView>
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
  dateBtnDisabled: { opacity: 0.4 },
  dateBtnText: { fontSize: 14, fontWeight: '600', color: theme.colors.primary },
  dateBtnTextDisabled: { color: theme.colors.muted },
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  name: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  meta: { fontSize: 12, color: theme.colors.subtext, marginTop: 2 },
  statusRow: { flexDirection: 'row', gap: 4 },
  statusBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
  },
  statusBtnActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  statusText: { fontSize: 13, fontWeight: '700', color: theme.colors.subtext },
  statusTextActive: { color: '#fff' },
  saveBtn: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
