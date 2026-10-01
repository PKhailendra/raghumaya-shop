import { Alert, ScrollView, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../src/store/auth';
import { AppHeader } from '../../src/components/AppHeader';
import { theme } from '../../src/theme';

interface MenuItem {
  label: string;
  sub?: string;
  route?: string;
  action?: () => void;
}

export default function MoreScreen() {
  const router = useRouter();
  const account = useAuthStore((s) => s.account);
  const activeShop = useAuthStore((s) => s.activeShop)();
  const logout = useAuthStore((s) => s.logout);

  const items: MenuItem[] = [
    { label: 'Stock alerts', sub: 'Low stock, out of stock, expiry', route: '/alerts' },
    { label: 'Finance summary', sub: 'Revenue, expenses, profit', route: '/finance' },
    { label: 'Team', sub: 'Shop members and roles', route: '/team' },
    { label: 'Subscription', sub: 'Plan and billing status', route: '/subscription' },
    { label: 'Settings', sub: 'Account and app settings', route: '/settings' },
  ];

  const confirmLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container}>
      <AppHeader title="More" subtitle={account?.name ?? account?.email ?? ''} />

      <View style={styles.shopCard}>
        <Text style={styles.shopLabel}>Active shop</Text>
        <Text style={styles.shopName}>{activeShop?.name ?? 'No shop selected'}</Text>
        {activeShop?.state ? <Text style={styles.shopMeta}>{activeShop.state}</Text> : null}
        <TouchableOpacity style={styles.switchBtn} onPress={() => router.push('/settings')}>
          <Text style={styles.switchBtnText}>Switch shop</Text>
        </TouchableOpacity>
      </View>

      {items.map((it) => (
        <TouchableOpacity
          key={it.label}
          style={styles.menuRow}
          onPress={() => it.route && router.push(it.route as never)}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.menuLabel}>{it.label}</Text>
            {it.sub ? <Text style={styles.menuSub}>{it.sub}</Text> : null}
          </View>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      ))}

      <TouchableOpacity style={styles.logoutBtn} onPress={confirmLogout}>
        <Text style={styles.logoutText}>Log out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  shopCard: { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, padding: 16, marginHorizontal: 16, marginBottom: 12 },
  shopLabel: { fontSize: 12, color: theme.colors.subtext },
  shopName: { fontSize: 18, fontWeight: '700', color: theme.colors.text, marginTop: 4 },
  shopMeta: { fontSize: 13, color: theme.colors.subtext, marginTop: 2 },
  switchBtn: { marginTop: 12, backgroundColor: theme.colors.primaryLight, borderRadius: theme.radius.sm, paddingVertical: 10, alignItems: 'center' },
  switchBtnText: { color: theme.colors.primary, fontWeight: '700', fontSize: 14 },
  menuRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.card, borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingHorizontal: 16, paddingVertical: 14 },
  menuLabel: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  menuSub: { fontSize: 12, color: theme.colors.subtext, marginTop: 2 },
  chevron: { fontSize: 20, color: theme.colors.muted },
  logoutBtn: { margin: 16, backgroundColor: theme.colors.dangerBg, borderRadius: theme.radius.sm, paddingVertical: 14, alignItems: 'center' },
  logoutText: { color: theme.colors.danger, fontWeight: '700', fontSize: 15 },
});
