import { Alert, ScrollView, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../src/store/auth';
import { AppHeader } from '../../src/components/AppHeader';
import { theme } from '../../src/theme';
import { useLang } from '../../src/i18n';

export default function MoreScreen() {
  const router = useRouter();
  const account = useAuthStore((s) => s.account);
  const activeShop = useAuthStore((s) => s.activeShop)();
  const logout = useAuthStore((s) => s.logout);
  const { lang, setLang, t } = useLang();
  const can = useAuthStore((s) => s.can);

  interface MenuItem {
    label: string;
    sub?: string;
    route?: string;
    permission?: string;
    action?: () => void;
  }

  const items: MenuItem[] = [
    { label: t('Attendance'), sub: 'Mark daily staff attendance', route: '/attendance', permission: 'ATTENDANCE_VIEW' },
    { label: t('Salary'), sub: 'Salary slips, advances, payments', route: '/salary', permission: 'SALARY_VIEW' },
    { label: t('Expenses'), sub: 'Track shop spending', route: '/expenses', permission: 'FINANCE_VIEW' },
    { label: t('Daily Closing'), sub: 'End-of-day sales summary', route: '/daily-closing', permission: 'ANALYTICS_VIEW' },
    { label: 'Stock alerts', sub: 'Low stock, out of stock, expiry', route: '/alerts', permission: 'STOCK_VIEW' },
    { label: 'Finance summary', sub: 'Revenue, expenses, profit', route: '/finance', permission: 'FINANCE_VIEW' },
    { label: 'Team', sub: 'Shop members and roles', route: '/team', permission: 'EMPLOYEE_VIEW' },
    { label: 'Subscription', sub: 'Plan and billing status', route: '/subscription', permission: 'SUBSCRIPTION_VIEW' },
    { label: t('Settings'), sub: 'Account and app settings', route: '/settings', permission: 'SETTINGS_VIEW' },
  ].filter((it) => !it.permission || can(it.permission));

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
      <AppHeader title={t('More')} subtitle={account?.name ?? account?.email ?? ''} />

      <View style={styles.shopCard}>
        <Text style={styles.shopLabel}>Active shop</Text>
        <Text style={styles.shopName}>{activeShop?.name ?? 'No shop selected'}</Text>
        {activeShop?.state ? <Text style={styles.shopMeta}>{activeShop.state}</Text> : null}
        <TouchableOpacity style={styles.switchBtn} onPress={() => router.push('/settings')}>
          <Text style={styles.switchBtnText}>Switch shop</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.langRow}
        onPress={() => setLang(lang === 'en' ? 'hi' : 'en')}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.menuLabel}>{t('Language')}</Text>
          <Text style={styles.menuSub}>
            {lang === 'en' ? 'English — हिंदी में बदलें' : 'हिंदी — Switch to English'}
          </Text>
        </View>
        <Text style={styles.langToggle}>{lang === 'en' ? 'हिंदी' : 'EN'}</Text>
      </TouchableOpacity>

      {items.map((it) => (
        <TouchableOpacity
          key={it.route ?? it.label}
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
  langRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: 16, paddingVertical: 14, marginHorizontal: 16, marginBottom: 12, borderRadius: theme.radius.md },
  langToggle: { fontSize: 14, fontWeight: '700', color: theme.colors.primary, backgroundColor: theme.colors.primaryLight, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
});
