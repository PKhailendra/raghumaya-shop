import { useState } from 'react';
import {
  ScrollView, Text, View, StyleSheet, Pressable, Modal,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../src/store/auth';
import {
  useShopMembers, inviteMember, updateMember, removeMember,
  type ShopMember,
} from '../src/api/shops';
import { LoadingSpinner } from '../src/components/LoadingSpinner';
import { ErrorState } from '../src/components/ErrorState';
import { EmptyState } from '../src/components/EmptyState';
import { StatusChip } from '../src/components/StatusChip';
import { theme } from '../src/theme';

/* Roles the owner can assign (OWNER itself is never assignable here) */
const ROLES = ['MANAGER', 'CASHIER', 'ACCOUNTANT', 'INVENTORY_STAFF', 'STAFF'] as const;

const ROLE_DEFAULTS: Record<string, string[]> = {
  MANAGER: ['SHOP_VIEW','EMPLOYEE_VIEW','EMPLOYEE_CREATE','EMPLOYEE_UPDATE','EMPLOYEE_DELETE','INVENTORY_VIEW','INVENTORY_CREATE','INVENTORY_UPDATE','INVENTORY_DELETE','STOCK_VIEW','STOCK_ADJUST','CUSTOMER_VIEW','CUSTOMER_CREATE','CUSTOMER_UPDATE','CUSTOMER_DELETE','ORDER_VIEW','ORDER_CREATE','ORDER_UPDATE','ORDER_CANCEL','INVOICE_VIEW','INVOICE_CREATE','INVOICE_UPDATE','PAYMENT_VIEW','PAYMENT_CREATE','FINANCE_VIEW','FINANCE_CREATE','FINANCE_UPDATE','ANALYTICS_VIEW','SETTINGS_VIEW','SUBSCRIPTION_VIEW','REFERRAL_VIEW','REFERRAL_MANAGE','NOTIFICATION_VIEW','NOTIFICATION_UPDATE','AUDIT_VIEW','ATTENDANCE_VIEW','ATTENDANCE_MARK','SALARY_VIEW'],
  CASHIER: ['SHOP_VIEW','INVENTORY_VIEW','STOCK_VIEW','CUSTOMER_VIEW','CUSTOMER_CREATE','CUSTOMER_UPDATE','ORDER_VIEW','ORDER_CREATE','ORDER_UPDATE','INVOICE_VIEW','INVOICE_CREATE','INVOICE_UPDATE','PAYMENT_VIEW','PAYMENT_CREATE','NOTIFICATION_VIEW','ATTENDANCE_VIEW'],
  ACCOUNTANT: ['SHOP_VIEW','CUSTOMER_VIEW','INVOICE_VIEW','PAYMENT_VIEW','PAYMENT_CREATE','FINANCE_VIEW','FINANCE_CREATE','FINANCE_UPDATE','ANALYTICS_VIEW','NOTIFICATION_VIEW','ATTENDANCE_VIEW','SALARY_VIEW','SALARY_MANAGE'],
  INVENTORY_STAFF: ['SHOP_VIEW','INVENTORY_VIEW','INVENTORY_CREATE','INVENTORY_UPDATE','STOCK_VIEW','STOCK_ADJUST','NOTIFICATION_VIEW','ATTENDANCE_VIEW'],
  STAFF: ['SHOP_VIEW','INVENTORY_VIEW','STOCK_VIEW','CUSTOMER_VIEW','ORDER_VIEW','INVOICE_VIEW','NOTIFICATION_VIEW','ATTENDANCE_VIEW'],
};

/* Permissions grouped for the checklist UI */
const PERM_GROUPS: { title: string; perms: string[] }[] = [
  { title: 'Shop & Team', perms: ['SHOP_VIEW','SHOP_UPDATE','EMPLOYEE_VIEW','EMPLOYEE_CREATE','EMPLOYEE_UPDATE','EMPLOYEE_DELETE'] },
  { title: 'Inventory & Stock', perms: ['INVENTORY_VIEW','INVENTORY_CREATE','INVENTORY_UPDATE','INVENTORY_DELETE','STOCK_VIEW','STOCK_ADJUST'] },
  { title: 'Customers & Orders', perms: ['CUSTOMER_VIEW','CUSTOMER_CREATE','CUSTOMER_UPDATE','CUSTOMER_DELETE','ORDER_VIEW','ORDER_CREATE','ORDER_UPDATE','ORDER_CANCEL'] },
  { title: 'Billing & Payments', perms: ['INVOICE_VIEW','INVOICE_CREATE','INVOICE_UPDATE','PAYMENT_VIEW','PAYMENT_CREATE'] },
  { title: 'Finance & Reports', perms: ['FINANCE_VIEW','FINANCE_CREATE','FINANCE_UPDATE','FINANCE_DELETE','ANALYTICS_VIEW','AUDIT_VIEW'] },
  { title: 'HR', perms: ['ATTENDANCE_VIEW','ATTENDANCE_MARK','SALARY_VIEW','SALARY_MANAGE'] },
  { title: 'Settings & More', perms: ['SETTINGS_VIEW','SETTINGS_UPDATE','SUBSCRIPTION_VIEW','SUBSCRIPTION_MANAGE','REFERRAL_VIEW','REFERRAL_MANAGE','NOTIFICATION_VIEW','NOTIFICATION_UPDATE'] },
];

function prettyRole(r: string): string {
  return r.split('_').map((w) => w[0] + w.slice(1).toLowerCase()).join(' ');
}

export default function TeamScreen() {
  const activeShopId = useAuthStore((s) => s.activeShopId);
  const can = useAuthStore((s) => s.can);
  const queryClient = useQueryClient();
  const members = useShopMembers(activeShopId);

  const [addOpen, setAddOpen] = useState(false);
  const [editMember, setEditMember] = useState<ShopMember | null>(null);

  const canCreate = can('EMPLOYEE_CREATE');
  const canUpdate = can('EMPLOYEE_UPDATE');
  const canDelete = can('EMPLOYEE_DELETE');

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['shops', activeShopId, 'members'] });
  };

  if (members.isLoading) return <LoadingSpinner />;
  if (members.isError)
    return <ErrorState message="Could not load team members." onRetry={() => members.refetch()} />;

  const list = members.data?.data ?? [];

  const onMemberPress = (m: ShopMember) => {
    if (m.role === 'OWNER') {
      Alert.alert(prettyRole(m.role), `${m.name}\n${m.email ?? m.phone ?? ''}\n\nThe shop owner cannot be edited or removed.`);
      return;
    }
    const actions: { text: string; onPress?: () => void; style?: 'destructive' | 'cancel' }[] = [];
    if (canUpdate) {
      actions.push({ text: 'Edit role & permissions', onPress: () => setEditMember(m) });
      actions.push({
        text: m.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate',
        onPress: () => toggleStatus(m),
      });
    }
    if (canDelete) {
      actions.push({
        text: 'Remove from shop',
        style: 'destructive',
        onPress: () => confirmRemove(m),
      });
    }
    actions.push({ text: 'Cancel', style: 'cancel' });
    if (actions.length === 1) {
      Alert.alert(prettyRole(m.role), `${m.name}\n${m.email ?? m.phone ?? ''}`);
      return;
    }
    Alert.alert(m.name, `Role: ${prettyRole(m.role)}\nStatus: ${m.status}`, actions);
  };

  const toggleStatus = (m: ShopMember) => {
    const toActive = m.status !== 'ACTIVE';
    Alert.alert(
      toActive ? 'Reactivate member' : 'Deactivate member',
      toActive
        ? `${m.name} will be able to log in and use the shop again.`
        : `${m.name} will no longer be able to log in. You can reactivate them later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: toActive ? 'Reactivate' : 'Deactivate',
          style: toActive ? undefined : 'destructive',
          onPress: async () => {
            try {
              await updateMember(activeShopId!, m.id, { status: toActive ? 'ACTIVE' : 'SUSPENDED' });
              refresh();
            } catch (e) {
              Alert.alert('Failed', e instanceof Error ? e.message : 'Could not change status.');
            }
          },
        },
      ],
    );
  };

  const confirmRemove = (m: ShopMember) => {
    Alert.alert(
      'Remove member',
      `Remove ${m.name} from this shop? They will lose access immediately.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeMember(activeShopId!, m.id);
              refresh();
            } catch (e) {
              Alert.alert('Failed', e instanceof Error ? e.message : 'Could not remove member.');
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {list.length === 0 ? (
          <EmptyState title="No team members" message="You are the only member of this shop." />
        ) : (
          list.map((m) => (
            <Pressable key={m.id} style={styles.row} onPress={() => onMemberPress(m)}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{m.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{m.name}</Text>
                <Text style={styles.meta}>{m.email ?? m.phone ?? prettyRole(m.role)}</Text>
              </View>
              <View style={styles.chips}>
                <StatusChip status={m.status} />
                <Text style={styles.role}>{prettyRole(m.role)}</Text>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>

      {canCreate && (
        <Pressable style={styles.fab} onPress={() => setAddOpen(true)}>
          <Text style={styles.fabText}>+ Add member</Text>
        </Pressable>
      )}

      <MemberFormModal
        visible={addOpen}
        title="Add team member"
        onClose={() => setAddOpen(false)}
        onSaved={() => { setAddOpen(false); refresh(); }}
        shopId={activeShopId!}
      />
      <MemberFormModal
        visible={!!editMember}
        title={editMember ? `Edit — ${editMember.name}` : 'Edit member'}
        member={editMember}
        onClose={() => setEditMember(null)}
        onSaved={() => { setEditMember(null); refresh(); }}
        shopId={activeShopId!}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ */

function MemberFormModal({
  visible, title, member, shopId, onClose, onSaved,
}: {
  visible: boolean;
  title: string;
  member?: ShopMember | null;
  shopId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!member;
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string>('STAFF');
  const [permissions, setPermissions] = useState<string[]>(ROLE_DEFAULTS.STAFF);
  const [showPerms, setShowPerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when opened with a different member
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = isEdit ? member!.id : 'new';
  if (visible && key !== lastKey) {
    setLastKey(key);
    setError(null);
    setShowPerms(false);
    setBusy(false);
    if (isEdit) {
      setRole(member!.role);
      setPermissions(member!.permissions ?? ROLE_DEFAULTS[member!.role] ?? []);
    } else {
      setFullName(''); setPhone(''); setEmail('');
      setRole('STAFF'); setPermissions(ROLE_DEFAULTS.STAFF);
    }
  }

  const pickRole = (r: string) => {
    setRole(r);
    setPermissions([...(ROLE_DEFAULTS[r] ?? [])]);
  };

  const togglePerm = (p: string) => {
    setPermissions((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  };

  const save = async () => {
    setError(null);
    if (!isEdit && (!fullName.trim() || !phone.trim())) {
      setError('Name and phone are required.');
      return;
    }
    setBusy(true);
    try {
      if (isEdit) {
        await updateMember(shopId, member!.id, { role, permissions });
      } else {
        await inviteMember(shopId, {
          fullName: fullName.trim(),
          phone: phone.trim(),
          ...(email.trim() ? { email: email.trim() } : {}),
          role,
          permissions,
        });
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent}>
        <Text style={styles.modalTitle}>{title}</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {!isEdit && (
          <>
            <Text style={styles.label}>Full name *</Text>
            <TextInput style={styles.input} value={fullName} onChangeText={setFullName}
              placeholder="e.g. Ramesh Kumar" placeholderTextColor={theme.colors.muted} />
            <Text style={styles.label}>Phone *</Text>
            <TextInput style={styles.input} value={phone} onChangeText={setPhone}
              placeholder="10-digit mobile number" placeholderTextColor={theme.colors.muted}
              keyboardType="phone-pad" />
            <Text style={styles.label}>Email (optional)</Text>
            <TextInput style={styles.input} value={email} onChangeText={setEmail}
              placeholder="name@example.com" placeholderTextColor={theme.colors.muted}
              keyboardType="email-address" autoCapitalize="none" />
          </>
        )}

        <Text style={styles.label}>Role</Text>
        <View style={styles.roleRow}>
          {ROLES.map((r) => (
            <Pressable
              key={r}
              style={[styles.roleChip, role === r && styles.roleChipActive]}
              onPress={() => pickRole(r)}
            >
              <Text style={[styles.roleChipText, role === r && styles.roleChipTextActive]}>
                {prettyRole(r)}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.hint}>Changing the role resets permissions to that role&apos;s defaults.</Text>

        <Pressable style={styles.permToggle} onPress={() => setShowPerms((v) => !v)}>
          <Text style={styles.permToggleText}>
            {showPerms ? '▾' : '▸'} Permissions ({permissions.length} selected)
          </Text>
        </Pressable>
        {showPerms && PERM_GROUPS.map((g) => (
          <View key={g.title} style={styles.permGroup}>
            <Text style={styles.permGroupTitle}>{g.title}</Text>
            {g.perms.map((p) => {
              const on = permissions.includes(p);
              return (
                <Pressable key={p} style={styles.permRow} onPress={() => togglePerm(p)}>
                  <View style={[styles.checkbox, on && styles.checkboxOn]}>
                    {on && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.permLabel}>{p}</Text>
                </Pressable>
              );
            })}
          </View>
        ))}

        <View style={styles.modalActions}>
          <Pressable style={[styles.btn, styles.btnSecondary]} onPress={onClose} disabled={busy}>
            <Text style={styles.btnSecondaryText}>Cancel</Text>
          </Pressable>
          <Pressable style={[styles.btn, styles.btnPrimary]} onPress={save} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Save</Text>}
          </Pressable>
        </View>
      </ScrollView>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 16, paddingBottom: 96 },
  row: { flexDirection: 'row', backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, padding: 12, marginBottom: 8, alignItems: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarText: { fontSize: 18, fontWeight: '700', color: theme.colors.primary },
  name: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  meta: { fontSize: 12, color: theme.colors.subtext, marginTop: 2 },
  chips: { alignItems: 'flex-end', gap: 4 },
  role: { fontSize: 11, fontWeight: '700', color: theme.colors.primary },
  fab: { position: 'absolute', left: 16, right: 16, bottom: 24, backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, padding: 14, alignItems: 'center' },
  fabText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  modal: { flex: 1, backgroundColor: theme.colors.background },
  modalContent: { padding: 20, paddingBottom: 48 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: theme.colors.text, marginBottom: 16 },
  error: { color: theme.colors.danger, fontSize: 13, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', color: theme.colors.text, marginTop: 12, marginBottom: 6 },
  input: { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, padding: 12, fontSize: 15, color: theme.colors.text },
  roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  roleChip: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: theme.colors.card },
  roleChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  roleChipText: { fontSize: 13, color: theme.colors.text, fontWeight: '600' },
  roleChipTextActive: { color: '#fff' },
  hint: { fontSize: 11, color: theme.colors.subtext, marginTop: 6 },
  permToggle: { marginTop: 16, paddingVertical: 10 },
  permToggleText: { fontSize: 14, fontWeight: '700', color: theme.colors.primary },
  permGroup: { marginTop: 8 },
  permGroupTitle: { fontSize: 12, fontWeight: '700', color: theme.colors.subtext, textTransform: 'uppercase', marginBottom: 4, marginTop: 8 },
  permRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: theme.colors.border, marginRight: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.card },
  checkboxOn: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '700' },
  permLabel: { fontSize: 13, color: theme.colors.text, fontFamily: 'monospace' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  btn: { flex: 1, borderRadius: theme.radius.md, padding: 14, alignItems: 'center' },
  btnPrimary: { backgroundColor: theme.colors.primary },
  btnPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnSecondary: { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border },
  btnSecondaryText: { color: theme.colors.text, fontSize: 15, fontWeight: '600' },
});
