import { Alert, ScrollView, Text, View, StyleSheet } from 'react-native';
import { useSubscription } from '../src/api/shops';
import { LoadingSpinner } from '../src/components/LoadingSpinner';
import { ErrorState } from '../src/components/ErrorState';
import { StatusChip } from '../src/components/StatusChip';
import { formatDate } from '../src/utils/format';
import { theme } from '../src/theme';

export default function SubscriptionScreen() {
  const sub = useSubscription();

  if (sub.isLoading) return <LoadingSpinner />;
  if (sub.isError || !sub.data)
    return <ErrorState message="Could not load subscription details." onRetry={() => sub.refetch()} />;

  const s = sub.data;
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>Plan</Text>
          <Text style={styles.value}>{s.planCode}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Status</Text>
          <StatusChip status={s.status} />
        </View>
        {s.currentPeriodEnd ? (
          <View style={styles.row}>
            <Text style={styles.label}>Renews on</Text>
            <Text style={styles.value}>{formatDate(s.currentPeriodEnd)}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.note}>
        <Text style={styles.noteText} onPress={() => Alert.alert('Change plan', 'Change your plan from the web dashboard or contact support.')}>
          To upgrade or cancel your plan, use the web dashboard.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 16 },
  card: { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, padding: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  label: { fontSize: 14, color: theme.colors.subtext },
  value: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  note: { marginTop: 12, backgroundColor: theme.colors.primaryLight, borderRadius: theme.radius.md, padding: 14 },
  noteText: { fontSize: 13, color: theme.colors.primary, lineHeight: 20 },
});
