import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { useAuthStore } from '../src/store/auth';
import { useShopMembers } from '../src/api/shops';
import { LoadingSpinner } from '../src/components/LoadingSpinner';
import { ErrorState } from '../src/components/ErrorState';
import { EmptyState } from '../src/components/EmptyState';
import { StatusChip } from '../src/components/StatusChip';
import { theme } from '../src/theme';

export default function TeamScreen() {
  const activeShopId = useAuthStore((s) => s.activeShopId);
  const members = useShopMembers(activeShopId);

  if (members.isLoading) return <LoadingSpinner />;
  if (members.isError)
    return <ErrorState message="Could not load team members." onRetry={() => members.refetch()} />;

  const list = members.data?.data ?? [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {list.length === 0 ? (
        <EmptyState title="No team members" message="You are the only member of this shop." />
      ) : (
        list.map((m) => (
          <View key={m.id} style={styles.row}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{m.name.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{m.name}</Text>
              <Text style={styles.meta}>{m.email ?? m.phone ?? m.role}</Text>
            </View>
            <View style={styles.chips}>
              <StatusChip status={m.status} />
              <Text style={styles.role}>{m.role}</Text>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 16 },
  row: { flexDirection: 'row', backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, padding: 12, marginBottom: 8, alignItems: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarText: { fontSize: 18, fontWeight: '700', color: theme.colors.primary },
  name: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  meta: { fontSize: 12, color: theme.colors.subtext, marginTop: 2 },
  chips: { alignItems: 'flex-end', gap: 4 },
  role: { fontSize: 11, fontWeight: '700', color: theme.colors.primary },
});
