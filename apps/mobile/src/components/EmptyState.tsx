import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../theme';

export function EmptyState(props: { title: string; message?: string }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{props.title}</Text>
      {props.message ? <Text style={styles.message}>{props.message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: theme.spacing.xl, alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
  message: { fontSize: 13, color: theme.colors.subtext, marginTop: 6, textAlign: 'center' },
});
