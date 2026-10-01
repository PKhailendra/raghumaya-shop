import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { theme } from '../theme';

export function ErrorState(props: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.message}>{props.message}</Text>
      {props.onRetry ? (
        <TouchableOpacity style={styles.button} onPress={props.onRetry}>
          <Text style={styles.buttonText}>Retry</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: theme.spacing.xl, alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
  message: { fontSize: 13, color: theme.colors.subtext, marginTop: 6, textAlign: 'center' },
  button: {
    marginTop: theme.spacing.md,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  buttonText: { color: '#fff', fontWeight: '600' },
});
