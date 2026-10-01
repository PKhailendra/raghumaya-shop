import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../theme';

export interface BarDatum {
  label: string;
  value: number;
}

/** Lightweight custom bar chart — no native dependencies. */
export function ChartCard(props: { title: string; data: BarDatum[]; emptyMessage?: string }) {
  const max = Math.max(1, ...props.data.map((d) => d.value));
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{props.title}</Text>
      {props.data.length === 0 ? (
        <Text style={styles.empty}>{props.emptyMessage ?? 'No data yet.'}</Text>
      ) : (
        <View style={styles.bars}>
          {props.data.map((d, i) => (
            <View key={i} style={styles.barCol}>
              <View style={styles.barTrack}>
                <View
                  style={[styles.barFill, { height: `${Math.max(2, (d.value / max) * 100)}%` }]}
                />
              </View>
              <Text style={styles.barLabel} numberOfLines={1}>
                {d.label}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    margin: theme.spacing.lg,
    marginBottom: 0,
  },
  title: { fontSize: 15, fontWeight: '700', color: theme.colors.text, marginBottom: theme.spacing.md },
  empty: { fontSize: 13, color: theme.colors.subtext },
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: 150, justifyContent: 'space-between' },
  barCol: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  barTrack: { width: '55%', height: 120, justifyContent: 'flex-end', backgroundColor: theme.colors.mutedBg, borderRadius: 4, overflow: 'hidden' },
  barFill: { width: '100%', backgroundColor: theme.colors.primary, borderRadius: 4 },
  barLabel: { fontSize: 9, color: theme.colors.subtext, marginTop: 4 },
});
