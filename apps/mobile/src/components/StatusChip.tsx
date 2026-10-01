import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../theme';

const tones: Record<string, { bg: string; fg: string }> = {
  DRAFT: { bg: theme.colors.mutedBg, fg: theme.colors.muted },
  ISSUED: { bg: theme.colors.primaryLight, fg: theme.colors.primary },
  PARTIALLY_PAID: { bg: theme.colors.warningBg, fg: theme.colors.warning },
  PAID: { bg: theme.colors.successBg, fg: theme.colors.success },
  OVERDUE: { bg: theme.colors.dangerBg, fg: theme.colors.danger },
  CANCELLED: { bg: theme.colors.mutedBg, fg: theme.colors.muted },
};

export function StatusChip(props: { status: string }) {
  const tone = tones[props.status] ?? { bg: theme.colors.mutedBg, fg: theme.colors.muted };
  const label = props.status.replace(/_/g, ' ');
  return (
    <View style={[styles.chip, { backgroundColor: tone.bg }]}>
      <Text style={[styles.text, { color: tone.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
});
