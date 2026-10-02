import { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { theme } from '../theme';
import { formatINR } from '../utils/format';

export interface BarDatum {
  label: string;
  value: number;
  /** short day label, e.g. "19" */
  shortLabel?: string;
  /** true for the current day's bar */
  isToday?: boolean;
}

/** Lightweight custom bar chart — no native dependencies. Tap a bar to see its value. */
export function ChartCard(props: { title: string; data: BarDatum[]; emptyMessage?: string }) {
  const [selected, setSelected] = useState<number | null>(null);
  const data = props.data;
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((s, d) => s + d.value, 0);
  const avg = data.length > 0 ? total / data.length : 0;
  const best = data.reduce<BarDatum | null>(
    (b, d) => (!b || d.value > b.value ? d : b),
    null,
  );

  const shown = selected != null ? data[selected] : null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{props.title}</Text>

      {data.length === 0 ? (
        <Text style={styles.empty}>{props.emptyMessage ?? 'No data yet.'}</Text>
      ) : (
        <>
          {/* Summary strip */}
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>{data.length}-day total</Text>
              <Text style={styles.summaryValue}>{formatINR(total)}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Daily avg</Text>
              <Text style={styles.summaryValue}>{formatINR(avg)}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Best day</Text>
              <Text style={styles.summaryValue} numberOfLines={1}>
                {best ? `${best.label} · ${formatINR(best.value)}` : '—'}
              </Text>
            </View>
          </View>

          {/* Selected / hint line */}
          <Text style={styles.hint}>
            {shown
              ? `${shown.label}: ${formatINR(shown.value)}`
              : 'Tap a bar to see the exact amount'}
          </Text>

          <View style={styles.bars}>
            {data.map((d, i) => {
              const isSel = selected === i;
              return (
                <Pressable
                  key={i}
                  style={styles.barCol}
                  onPress={() => setSelected(isSel ? null : i)}
                >
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          height: `${Math.max(3, (d.value / max) * 100)}%`,
                          backgroundColor: d.isToday
                            ? theme.colors.success
                            : theme.colors.primary,
                          opacity: selected == null || isSel ? 1 : 0.45,
                        },
                      ]}
                    />
                  </View>
                  <Text
                    style={[
                      styles.barLabel,
                      (d.isToday || isSel) && styles.barLabelActive,
                    ]}
                    numberOfLines={1}
                  >
                    {d.shortLabel ?? d.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.legend}>
            <View style={[styles.dot, { backgroundColor: theme.colors.primary }]} />
            <Text style={styles.legendText}>Sales</Text>
            <View style={[styles.dot, { backgroundColor: theme.colors.success, marginLeft: 12 }]} />
            <Text style={styles.legendText}>Today</Text>
          </View>
        </>
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
  title: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  empty: { fontSize: 13, color: theme.colors.subtext, marginTop: 8 },
  summaryRow: { flexDirection: 'row', marginTop: 10, marginBottom: 4 },
  summaryItem: { flex: 1 },
  summaryLabel: { fontSize: 10, color: theme.colors.subtext, textTransform: 'uppercase' },
  summaryValue: { fontSize: 13, fontWeight: '700', color: theme.colors.text, marginTop: 2 },
  hint: { fontSize: 12, color: theme.colors.primary, fontWeight: '600', marginTop: 6, minHeight: 16 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: 150, justifyContent: 'space-between', marginTop: 4 },
  barCol: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  barTrack: { width: '55%', height: 118, justifyContent: 'flex-end', backgroundColor: theme.colors.mutedBg, borderRadius: 4, overflow: 'hidden' },
  barFill: { width: '100%', borderRadius: 4 },
  barLabel: { fontSize: 10, color: theme.colors.subtext, marginTop: 4 },
  barLabelActive: { color: theme.colors.text, fontWeight: '700' },
  legend: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: theme.colors.subtext, marginLeft: 4 },
});
