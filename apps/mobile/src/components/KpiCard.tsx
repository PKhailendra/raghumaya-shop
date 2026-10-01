import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../theme';
import { Money } from './Money';

export function KpiCard(props: { label: string; value: string | number; money?: boolean; tone?: 'default' | 'success' | 'warning' | 'danger' }) {
  const toneColor =
    props.tone === 'success' ? theme.colors.success
    : props.tone === 'warning' ? theme.colors.warning
    : props.tone === 'danger' ? theme.colors.danger
    : theme.colors.text;
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{props.label}</Text>
      {props.money ? (
        <Money value={props.value} style={[styles.value, { color: toneColor }]} />
      ) : (
        <Text style={[styles.value, { color: toneColor }]}>{props.value}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    margin: theme.spacing.xs,
  },
  label: { fontSize: 12, color: theme.colors.subtext, marginBottom: 4 },
  value: { fontSize: 18, fontWeight: '700' },
});
